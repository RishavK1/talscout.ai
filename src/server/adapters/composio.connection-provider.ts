import { Composio } from "@composio/core";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { ConnectionProvider, ToolkitConnection } from "@/server/ports";

/** Composio connected-account status -> our narrower, UI-facing status. */
function mapStatus(status: string): ToolkitConnection["status"] {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "INITIATED":
      return "pending";
    case "EXPIRED":
      return "expired";
    default:
      // FAILED, INACTIVE, and anything future/unknown all mean "not usable
      // right now, needs reconnecting" — fail closed to "revoked" rather
      // than risk treating an unrecognized status as usable.
      return "revoked";
  }
}

/** Composio's per-toolkit connection `state` blob is a loose, provider-
 *  specific bag of fields (its own schema types it as `.catchall(unknown)`
 *  — there is no single typed "account label" field across every toolkit).
 *  Best-effort read of a couple of common OAuth2-profile field names; falls
 *  back to null (never a hard failure, and never displayed as a secret —
 *  this is purely a UI display label). Verify against a real connected
 *  Gmail account once COMPOSIO_API_KEY is configured and refine here if a
 *  more reliable field is found. */
function extractAccountLabel(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const record = state as Record<string, unknown>;
  const candidate = record.email ?? record.emailAddress ?? record.account_id ?? record.subdomain;
  return typeof candidate === "string" ? candidate : null;
}

let client: Composio | null = null;
function getClient(): Composio {
  if (!client) {
    client = new Composio({ apiKey: getEnv().COMPOSIO_API_KEY });
  }
  return client;
}

/** Toolkits we proactively surface a custom auth config for, rather than
 *  Composio's shared default credentials — currently just Gmail, so the
 *  consent screen stays branded as this app (not "Composio") and reuses the
 *  Google OAuth client already verified for the existing direct-Gmail flow.
 *  Every other toolkit uses Composio-managed auth (its own default app). */
async function getOrCreateAuthConfigId(toolkitSlug: string): Promise<string> {
  const composio = getClient();
  const existing = await composio.authConfigs.list({ toolkit: toolkitSlug });
  if (existing.items.length > 0) return existing.items[0].id;

  const env = getEnv();
  if (toolkitSlug === "gmail" && env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
    // NOTE: exact `credentials` field names for a custom OAuth2 auth config
    // are the one piece of this adapter not yet exercised against a live
    // Composio API key (see the system design doc's "Risks to validate
    // early" — flagged there before this was written). Verify this shape
    // the first time a real COMPOSIO_API_KEY is configured; if Composio
    // rejects it, the catch below still leaves Gmail connectable via
    // Composio-managed auth rather than hard-failing the whole toolkit.
    try {
      const created = await composio.authConfigs.create(toolkitSlug, {
        type: "use_custom_auth",
        authScheme: "OAUTH2",
        name: "TalScout Gmail",
        credentials: {
          client_id: env.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        },
      });
      return created.id;
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "composio_custom_gmail_auth_config_failed_falling_back_to_managed",
      );
    }
  }

  const created = await composio.authConfigs.create(toolkitSlug, {
    type: "use_composio_managed_auth",
  });
  return created.id;
}

export class ComposioConnectionProvider implements ConnectionProvider {
  async createConnectLink(args: {
    tenantId: string;
    toolkitSlug: string;
    callbackUrl: string;
  }): Promise<{ url: string; connectionId: string }> {
    const composio = getClient();
    const authConfigId = await getOrCreateAuthConfigId(args.toolkitSlug);
    // allowMultiple: a tenant may legitimately want a second mailbox on the
    // same toolkit later (mirrors senderAccounts allowing >1 Gmail row per
    // tenant today) — reconnecting isn't blocked by an existing connection.
    const request = await composio.connectedAccounts.link(args.tenantId, authConfigId, {
      callbackUrl: args.callbackUrl,
      allowMultiple: true,
    });
    if (!request.redirectUrl) {
      throw new Error(`Composio returned no redirect URL for toolkit "${args.toolkitSlug}"`);
    }
    return { url: request.redirectUrl, connectionId: request.id };
  }

  async listConnections(tenantId: string): Promise<ToolkitConnection[]> {
    const composio = getClient();
    const result = await composio.connectedAccounts.list({ userIds: [tenantId] });
    return result.items.map((item) => ({
      id: item.id,
      toolkitSlug: item.toolkit.slug,
      status: mapStatus(item.status),
      accountLabel: extractAccountLabel(item.state),
      createdAt: item.createdAt,
    }));
  }

  async getConnection(tenantId: string, connectionId: string): Promise<ToolkitConnection | null> {
    const composio = getClient();
    try {
      const item = await composio.connectedAccounts.get(connectionId);
      return {
        id: item.id,
        toolkitSlug: item.toolkit.slug,
        status: mapStatus(item.status),
        accountLabel: extractAccountLabel(item.state),
        createdAt: item.createdAt,
      };
    } catch {
      return null;
    }
  }

  /** Verified live against a real connected Gmail account: Composio's raw
   *  connection `state` only holds OAuth tokens (access_token, id_token,
   *  ...), no plain email field, and the id_token's own claims didn't
   *  include one either for this auth config — so extractAccountLabel's
   *  static guess always comes back null for Gmail specifically. This
   *  executes GMAIL_GET_PROFILE through Composio (which handles token
   *  refresh itself, unlike reading the possibly-stale access_token out of
   *  `state` and calling Google directly) to get the real address. Only
   *  Gmail for now — the toolkits this app curates in Settings
   *  (Calendar, Notion) haven't been checked for an equivalent profile
   *  action, and getting this wrong should degrade to "no label shown",
   *  never break the connection itself. */
  async resolveAccountLabel(tenantId: string, connectionId: string, toolkitSlug: string): Promise<string | null> {
    if (toolkitSlug !== "gmail") return null;
    try {
      const composio = getClient();
      const result = await composio.tools.execute("GMAIL_GET_PROFILE", {
        userId: tenantId,
        connectedAccountId: connectionId,
        arguments: {},
        // GMAIL_GET_PROFILE is a read-only lookup we call once right after
        // a connection completes — pinning to a specific toolkit version
        // isn't worth tracking for that; see ComposioToolVersionRequiredError's
        // own docs for why manual execute() otherwise refuses "latest".
        dangerouslySkipVersionCheck: true,
      } as Parameters<typeof composio.tools.execute>[1]);
      const email = (result.data as Record<string, unknown> | undefined)?.emailAddress;
      return typeof email === "string" ? email : null;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), connectionId },
        "composio_resolve_gmail_account_label_failed",
      );
      return null;
    }
  }

  async listAvailableToolkits(): Promise<{ slug: string; name: string; logoUrl: string | null }[]> {
    const composio = getClient();
    // toolkits.get({}) — not .list(); it's an overloaded method (single slug
    // vs. list-query) that returns a plain array, not `{ items }` (see
    // ToolKitListResponseSchema in @composio/core's type-script source).
    const result = await composio.toolkits.get({ limit: 200 });
    return result.map((t) => ({
      slug: t.slug,
      name: t.name,
      logoUrl: t.meta.logo ?? null,
    }));
  }

  async disconnect(tenantId: string, connectionId: string): Promise<void> {
    // Defense in depth: confirm the connection actually belongs to this
    // tenant (Composio user_id) before deleting, so one tenant can never
    // disconnect another tenant's connection by guessing/observing an id —
    // the route layer already scopes by tenant, this is the second check.
    const existing = await this.getConnection(tenantId, connectionId);
    if (!existing) return;
    await getClient().connectedAccounts.delete(connectionId);
  }
}
