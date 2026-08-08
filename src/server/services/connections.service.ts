import { withTenantTx, type TenantContext } from "@/server/db/tx";
import { getServices } from "@/server/container";
import { connectionRepo } from "@/server/repositories/connection.repo";
import { signConnectState, verifyConnectState } from "@/server/lib/connection-state";
import { BadRequest, NotFound } from "@/server/http/errors";

/** Toolkit slugs must be short lowercase identifiers — guards against
 *  passing an arbitrary string straight through to Composio's API (and,
 *  since it ends up in a signed-but-still-attacker-influenced state token
 *  and a callback redirect, keeps that surface boring). Exported — the
 *  agent's own connect_app tool (composio-tools.ts) reuses this exact
 *  pattern rather than trusting whatever string the model produces. */
export const TOOLKIT_SLUG_RE = /^[a-z0-9_-]{1,64}$/;

export const connectionsService = {
  /** The short, curated list this app proactively surfaces as buttons in
   *  Settings. Deliberately just three to start (see the system design
   *  doc's Part A) — anything else is reachable via the agent's ad-hoc
   *  "connect any app" tool (Phase 3) against the full Composio catalog,
   *  not through this list. */
  curatedToolkits(): { slug: string; name: string }[] {
    return [
      { slug: "gmail", name: "Gmail" },
      { slug: "googlecalendar", name: "Google Calendar" },
      { slug: "notion", name: "Notion" },
    ];
  },

  async listConnections(ctx: TenantContext) {
    return await connectionRepo.list(ctx);
  },

  async createLink(ctx: { tenantId: string; userId: string }, toolkitSlug: string, appOrigin: string) {
    if (!TOOLKIT_SLUG_RE.test(toolkitSlug)) {
      throw new BadRequest("Invalid toolkit");
    }
    const state = signConnectState({ tenantId: ctx.tenantId, userId: ctx.userId, toolkitSlug });
    const callbackUrl = `${appOrigin}/api/connections/callback?state=${encodeURIComponent(state)}`;
    const { url, connectionId } = await getServices().connectionProvider.createConnectLink({
      tenantId: ctx.tenantId,
      toolkitSlug,
      callbackUrl,
    });
    await withTenantTx({ tenantId: ctx.tenantId, userId: ctx.userId }, (tx) =>
      connectionRepo.create(tx, { toolkitSlug, composioConnectionId: connectionId, createdBy: ctx.userId }),
    );
    return { url };
  },

  /** Called by the (session-less) callback route. Re-verifies the
   *  connection's real status against Composio itself — never trusts
   *  anything in the redirect's own query string, since that's client-
   *  controlled and visible/editable in the browser's network tab.
   *
   *  Idempotent by design: the `state` token is single-use in spirit but
   *  not enforced as single-use, and the callback CAN legitimately fire
   *  twice for the same connection (the user hits the browser back button
   *  after landing, or double-clicks a stale bookmarked link, or Composio's
   *  own redirect fires twice). The first call flips the row from
   *  "pending" to its real status; without this, the second call would
   *  find no "pending" row left, throw NotFound, and show the user a false
   *  "failed to connect" error for a connection that actually succeeded. */
  async completeCallback(state: string): Promise<{ toolkitSlug: string; connected: boolean }> {
    const payload = verifyConnectState(state);
    if (!payload) throw new BadRequest("Invalid or expired connection request");

    return await withTenantTx({ tenantId: payload.tenantId, userId: payload.userId }, async (tx) => {
      const rows = await connectionRepo.list(tx);
      const target =
        rows.find((r) => r.toolkitSlug === payload.toolkitSlug && r.status === "pending") ??
        rows.find((r) => r.toolkitSlug === payload.toolkitSlug && r.status === "active");
      if (!target) throw new NotFound("No matching connection found for this request");

      // Already resolved by an earlier call to this same callback — report
      // the same success without re-hitting Composio's API.
      if (target.status === "active") {
        return { toolkitSlug: payload.toolkitSlug, connected: true };
      }

      const provider = getServices().connectionProvider;
      const live = await provider.getConnection(payload.tenantId, target.composioConnectionId);
      if (!live) throw new NotFound("Connection not found");

      // Best-effort enrichment, only when the provider's own state didn't
      // already have a label and only once (right here, on the ONE
      // callback that flips this connection active) — never blocks or
      // fails the connection itself if this lookup errors.
      const accountLabel =
        live.accountLabel ??
        (await provider.resolveAccountLabel?.(payload.tenantId, target.composioConnectionId, payload.toolkitSlug).catch(
          () => null,
        )) ??
        null;

      await connectionRepo.updateStatus(tx, target.composioConnectionId, {
        status: live.status,
        accountLabel,
      });
      return { toolkitSlug: payload.toolkitSlug, connected: live.status === "active" };
    });
  },

  async disconnect(ctx: TenantContext, id: string) {
    const row = await connectionRepo.getById(ctx, id);
    if (!row) throw new NotFound("Connection not found");
    await getServices().connectionProvider.disconnect(ctx.tenantId, row.composioConnectionId);
    await connectionRepo.delete(ctx, id);
  },
};
