import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { agentConversations, agentMessages } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";

/** Cap on how many conversations one query returns — the UI's own "no cap
 *  on how many chats a user can have" promise is still true (nothing stops
 *  creating more), this only bounds a single list response so a workspace
 *  with thousands of old chats doesn't turn every page load into an
 *  unbounded full-table fetch. Comfortably above what any real user
 *  scrolls through in the sidebar. */
const LIST_LIMIT = 200;

export const agentRepo = {
  /** Scoped to the requesting user, not the whole tenant — an agent
   *  conversation is closer to a personal scratchpad (like a ChatGPT/
   *  Claude.ai chat) than a shared workspace resource like a blueprint or
   *  campaign. Without this, any recruiter/admin in the tenant could read
   *  every other teammate's chats (including whatever candidate/salary/
   *  strategy details they typed), just by knowing another user's
   *  conversation existed — RLS isolates by tenant, not by user, so this
   *  had to be enforced here explicitly. */
  async listConversations(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.tenantId, ctx.tenantId),
          eq(agentConversations.userId, ctx.userId!),
          isNull(agentConversations.archivedAt),
        ),
      )
      .orderBy(desc(agentConversations.pinned), desc(agentConversations.updatedAt))
      .limit(LIST_LIMIT);
  },

  async getConversation(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.tenantId, ctx.tenantId),
          eq(agentConversations.userId, ctx.userId!),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /** True count of messages already stored for this conversation — used to
   *  decide whether to generate a title, instead of trusting the client-
   *  reported length of the `messages` array it sent (which reflects
   *  whatever the browser happened to have in memory, not DB truth). */
  async countMessages(ctx: TenantContext, conversationId: string): Promise<number> {
    const [row] = await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(agentMessages)
      .where(and(eq(agentMessages.conversationId, conversationId), eq(agentMessages.tenantId, ctx.tenantId)));
    return row?.n ?? 0;
  },

  async createConversation(ctx: TenantContext, title?: string) {
    const [row] = await ctx.tx
      .insert(agentConversations)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId!, title: title ?? "New chat" })
      .returning();
    return row;
  },

  async renameConversation(ctx: TenantContext, id: string, title: string) {
    await ctx.tx
      .update(agentConversations)
      .set({ title, updatedAt: new Date() })
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.tenantId, ctx.tenantId),
          eq(agentConversations.userId, ctx.userId!),
        ),
      );
  },

  async touchConversation(ctx: TenantContext, id: string) {
    await ctx.tx
      .update(agentConversations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.tenantId, ctx.tenantId),
          eq(agentConversations.userId, ctx.userId!),
        ),
      );
  },

  async setPinned(ctx: TenantContext, id: string, pinned: boolean) {
    await ctx.tx
      .update(agentConversations)
      .set({ pinned })
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.tenantId, ctx.tenantId),
          eq(agentConversations.userId, ctx.userId!),
        ),
      );
  },

  async archiveConversation(ctx: TenantContext, id: string) {
    await ctx.tx
      .update(agentConversations)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.tenantId, ctx.tenantId),
          eq(agentConversations.userId, ctx.userId!),
        ),
      );
  },

  async listMessages(ctx: TenantContext, conversationId: string) {
    return await ctx.tx
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.conversationId, conversationId), eq(agentMessages.tenantId, ctx.tenantId)))
      .orderBy(agentMessages.createdAt);
  },

  async addMessage(
    ctx: TenantContext,
    input: { conversationId: string; role: "user" | "assistant" | "system"; parts: unknown },
  ) {
    const [row] = await ctx.tx
      .insert(agentMessages)
      .values({
        tenantId: ctx.tenantId,
        conversationId: input.conversationId,
        role: input.role,
        parts: input.parts,
      })
      .returning();
    return row;
  },
};
