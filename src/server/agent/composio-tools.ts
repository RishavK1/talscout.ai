import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { getEnv } from "@/server/config/env";
import { getServices } from "@/server/container";
import { connectionRepo } from "@/server/repositories/connection.repo";
import { TOOLKIT_SLUG_RE } from "@/server/services/connections.service";
import { signConnectState } from "@/server/lib/connection-state";
import { logger } from "@/server/observability/logger";
import { withTenantTx, type TenantContext } from "@/server/db/tx";

/** Hard cap on the TOTAL tool count (in-house + Composio) sent to the
 *  model in one request. Discovered live: OpenRouter's free-tier backend
 *  ("Darkbloom") rejects the entire tool-calling request with "at most 64
 *  tools are allowed" once the combined count crosses that line — and
 *  since OpenRouter is the fallback model (see models.ts), this bug only
 *  surfaces when Gemini fails first, which is exactly when a user most
 *  needs the fallback to actually work. Applied globally (not just when
 *  OpenRouter is the active candidate) since we don't know in advance
 *  which model in the chain will end up serving a given turn, and staying
 *  under the strictest known provider limit is cheap insurance for all of
 *  them. */
const TOTAL_TOOL_CAP = 64;

let client: Composio<VercelProvider> | null = null;
function getClient(): Composio<VercelProvider> {
  if (!client) {
    client = new Composio({ apiKey: getEnv().COMPOSIO_API_KEY, provider: new VercelProvider() });
  }
  return client;
}

/** Ad-hoc "connect any app" tool — not scoped to the curated Settings list
 *  (Gmail/Calendar/Notion). This is the chat's escape hatch into Composio's
 *  full toolkit catalog: a user can say "connect Slack" mid-conversation
 *  even before Slack has a dedicated card in Settings. Returns a `url` the
 *  frontend renders as a real "Connect X" button (see message-parts.tsx),
 *  same as the Settings page's own connect flow — reuses connectionsService
 *  end to end rather than duplicating the link-creation logic. */
function buildConnectAppTool(identity: { tenantId: string; userId: string }, appOrigin: string): ToolSet {
  return {
    connect_app: tool({
      description:
        "Starts connecting a third-party app (e.g. Slack, Notion, HubSpot, Zoom — 1000+ available, not just " +
        "the ones already listed in Settings) so its tools become usable in this chat. Returns a link the user " +
        "clicks to authorize — after they connect, ask them to try their request again so the newly-connected " +
        "app's tools are loaded. Use this whenever the user wants to use an app you don't already have tools " +
        "for, or explicitly asks to connect something. If the toolkit is already connected (see your own " +
        "instructions' connected-apps list), calling this WITHOUT addAnotherAccount just returns what's " +
        "already connected instead of creating a duplicate — only pass addAnotherAccount:true after the user " +
        "has explicitly confirmed, in their own words, that they want to add a genuinely different/additional " +
        "account for an app that's already connected.",
      inputSchema: z.object({
        toolkitSlug: z
          .string()
          .max(64)
          .describe("Lowercase app identifier, e.g. 'slack', 'notion', 'hubspot', 'zoom', 'stripe'"),
        addAnotherAccount: z
          .boolean()
          .optional()
          .describe(
            "Only true if the user explicitly confirmed adding ANOTHER account for a toolkit that's already " +
              "connected (see connected-apps list) — never set this just because the user asked to \"connect X\" " +
              "in general; ask them to confirm they want an additional account first.",
          ),
      }),
      execute: async (input) => {
        if (!TOOLKIT_SLUG_RE.test(input.toolkitSlug)) {
          // The model occasionally produces something like "Salesforce CRM"
          // instead of a real slug — reject before it reaches a signed
          // state token or Composio's API, same validation the Settings
          // connect flow already enforces (connections.service.ts).
          return { error: `"${input.toolkitSlug}" isn't a valid app identifier — use a short lowercase slug like "salesforce" or "google-drive".` };
        }
        // Defense in depth beneath the system prompt's own "don't
        // reconnect what's already connected, and ask before adding
        // another account" instruction (agent.service.ts) — live-verified
        // this gap for real: before this check existed, a model that still
        // called connect_app for an already-connected toolkit (wrong app-
        // name guess, weaker fallback model, adversarial phrasing) silently
        // created a SECOND active connection with no warning, and Settings'
        // UI only surfaced one of them, leaving the other invisible but
        // still live. Lists EVERY existing account (not just one) so the
        // model can name all of them back to the user. addAnotherAccount is
        // the explicit, typed "yes, I confirmed with the user" signal —
        // mirrors activate_campaign's own "wait for explicit yes" pattern
        // instead of trying to infer intent from prose alone.
        const existingActive = await withTenantTx(identity, (ctx) => connectionRepo.list(ctx)).then((rows) =>
          rows.filter((r) => r.toolkitSlug === input.toolkitSlug && r.status === "active"),
        );
        if (existingActive.length > 0 && !input.addAnotherAccount) {
          const labels = existingActive.map((c) => c.accountLabel ?? "an unlabeled account");
          return {
            alreadyConnected: true,
            toolkitSlug: input.toolkitSlug,
            accountLabels: labels,
            message:
              `${input.toolkitSlug} is already connected (${labels.join(", ")}) — its tools are already ` +
              `available, no need to connect again. If the user wants to add a genuinely different account, ` +
              `confirm that with them first, then call this again with addAnotherAccount:true.`,
          };
        }
        const state = signConnectState({
          tenantId: identity.tenantId,
          userId: identity.userId,
          toolkitSlug: input.toolkitSlug,
        });
        const callbackUrl = `${appOrigin}/api/connections/callback?state=${encodeURIComponent(state)}`;
        try {
          const { url, connectionId } = await getServices().connectionProvider.createConnectLink({
            tenantId: identity.tenantId,
            toolkitSlug: input.toolkitSlug,
            callbackUrl,
          });
          // Best-effort local record, same as the Settings flow — if this
          // write fails the connection still works, it just won't show up
          // pre-emptively in the Settings list until the callback re-syncs it.
          try {
            await withTenantTx(identity, (ctx) =>
              connectionRepo.create(ctx, {
                toolkitSlug: input.toolkitSlug,
                composioConnectionId: connectionId,
                createdBy: identity.userId,
              }),
            );
          } catch (err) {
            logger.warn({ err, toolkitSlug: input.toolkitSlug }, "agent_connect_app_local_record_failed");
          }
          return { url, toolkitSlug: input.toolkitSlug };
        } catch (err) {
          logger.error(
            { err: err instanceof Error ? err.message : String(err), toolkitSlug: input.toolkitSlug },
            "agent_connect_app_failed",
          );
          return {
            error: `Couldn't start connecting "${input.toolkitSlug}" — the app slug may not exist, or Composio is unavailable right now.`,
          };
        }
      },
    }),
  };
}

/**
 * Composio tools for this tenant's ALREADY-connected toolkits, scoped
 * exactly like Part A's connections (Composio's `user_id` = our tenantId).
 * Deliberately fails soft, never hard: if COMPOSIO_API_KEY isn't set, if
 * the tenant has no connections yet, or if the Composio API call itself
 * throws (network blip, bad tool schema, rate limit), this returns just the
 * connect_app tool (or an empty set) instead of throwing — a Composio
 * outage must never take down the whole agent turn, only the toolkit
 * actions that depend on it. See run-turn.ts's per-model isolation for the
 * same "one dependency's failure doesn't cascade" principle applied here
 * one level down, at tool-registry build time instead of model-call time.
 */
export async function buildComposioTools(
  identity: { tenantId: string; userId: string },
  appOrigin: string,
  /** Count of in-house tools this turn will also send — used to size the
   *  Composio fetch so the combined total stays under TOTAL_TOOL_CAP. See
   *  that constant's doc comment for why this exists. */
  reservedToolCount: number,
): Promise<ToolSet> {
  const connectTool = buildConnectAppTool(identity, appOrigin);
  if (!getEnv().COMPOSIO_API_KEY) return connectTool;

  // -1 for connect_app itself, always merged in below.
  const composioBudget = Math.max(0, TOTAL_TOOL_CAP - reservedToolCount - 1);
  if (composioBudget === 0) {
    logger.warn(
      { reservedToolCount, tenantId: identity.tenantId },
      "agent_composio_tools_skipped_no_budget_left",
    );
    return connectTool;
  }

  try {
    const connections = await withTenantTx(identity, (ctx: TenantContext) => connectionRepo.list(ctx));
    const activeToolkits = [...new Set(connections.filter((c) => c.status === "active").map((c) => c.toolkitSlug))];
    if (activeToolkits.length === 0) return connectTool;

    const composioTools = await getClient().tools.get(identity.tenantId, {
      toolkits: activeToolkits,
      // Sized to whatever's left of TOTAL_TOOL_CAP after in-house tools —
      // see that constant's doc comment. Even so, this is a request to
      // Composio's API, not a guaranteed exact cap on what comes back (a
      // per-toolkit vs. global interpretation of `limit` isn't documented
      // rock-solid), so the merge below still defensively slices as a
      // second line of defense.
      limit: composioBudget,
    });
    const merged = { ...connectTool, ...composioTools };
    const entries = Object.entries(merged);
    if (entries.length <= composioBudget + 1) return merged;
    logger.warn(
      { returned: entries.length, budget: composioBudget + 1, tenantId: identity.tenantId },
      "agent_composio_tools_truncated_exceeded_budget",
    );
    return Object.fromEntries(entries.slice(0, composioBudget + 1));
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), tenantId: identity.tenantId },
      "agent_composio_tools_load_failed_falling_back_to_connect_only",
    );
    return connectTool;
  }
}
