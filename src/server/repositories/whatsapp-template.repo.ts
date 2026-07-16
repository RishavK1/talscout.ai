import { and, eq, sql } from "drizzle-orm";
import { whatsappTemplates } from "@/server/db/schema";
import type { TenantContext } from "@/server/db/tx";
import { adminDb } from "@/server/db/client";

export const whatsappTemplateRepo = {
  async list(ctx: TenantContext) {
    return await ctx.tx
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.tenantId, ctx.tenantId))
      .orderBy(sql`${whatsappTemplates.createdAt} DESC`);
  },

  async listApprovedForSender(ctx: TenantContext, senderAccountId: string) {
    return await ctx.tx
      .select()
      .from(whatsappTemplates)
      .where(
        and(
          eq(whatsappTemplates.tenantId, ctx.tenantId),
          eq(whatsappTemplates.senderAccountId, senderAccountId),
          eq(whatsappTemplates.status, "approved"),
        ),
      )
      .orderBy(sql`${whatsappTemplates.createdAt} DESC`);
  },

  async getById(ctx: TenantContext, id: string) {
    const [row] = await ctx.tx
      .select()
      .from(whatsappTemplates)
      .where(
        and(
          eq(whatsappTemplates.id, id),
          eq(whatsappTemplates.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async create(
    ctx: TenantContext,
    input: {
      senderAccountId: string;
      metaTemplateName: string;
      category: "marketing" | "utility" | "authentication";
      language: string;
      bodyText: string;
      placeholderCount: number;
      metaTemplateId?: string;
    },
  ) {
    const [row] = await ctx.tx
      .insert(whatsappTemplates)
      .values({
        tenantId: ctx.tenantId,
        senderAccountId: input.senderAccountId,
        metaTemplateName: input.metaTemplateName,
        category: input.category,
        language: input.language,
        bodyText: input.bodyText,
        placeholderCount: input.placeholderCount,
        metaTemplateId: input.metaTemplateId,
      })
      .returning();
    return row;
  },

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: "pending" | "approved" | "rejected" | "disabled",
    rejectionReason?: string,
  ) {
    await ctx.tx
      .update(whatsappTemplates)
      .set({ status, rejectionReason, updatedAt: new Date() })
      .where(
        and(
          eq(whatsappTemplates.id, id),
          eq(whatsappTemplates.tenantId, ctx.tenantId),
        ),
      );
  },

  /** Admin-scoped: the cron-triggered status-sync job walks pending templates
   *  across every tenant in one pass rather than one job-per-tenant, so it
   *  needs the RLS-bypassing connection — same rationale as
   *  `outreachSendRepo.getByProviderMessageId`. */
  async listPendingAdmin() {
    return await adminDb()
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.status, "pending"));
  },

  async setStatusAdmin(
    id: string,
    status: "pending" | "approved" | "rejected" | "disabled",
    rejectionReason?: string,
  ) {
    await adminDb()
      .update(whatsappTemplates)
      .set({ status, rejectionReason, updatedAt: new Date() })
      .where(eq(whatsappTemplates.id, id));
  },

  /** Admin-scoped: the `message_template_status_update` webhook event only
   *  carries Meta's own template id, not ours or a tenant — same
   *  no-tenant-context reasoning as `outreachSendRepo.getByProviderMessageId`. */
  async setStatusByMetaTemplateIdAdmin(
    metaTemplateId: string,
    status: "pending" | "approved" | "rejected" | "disabled",
    rejectionReason?: string,
  ) {
    await adminDb()
      .update(whatsappTemplates)
      .set({ status, rejectionReason, updatedAt: new Date() })
      .where(eq(whatsappTemplates.metaTemplateId, metaTemplateId));
  },
};
