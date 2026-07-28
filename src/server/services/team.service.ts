import { userRepo } from "@/server/repositories/user.repo";
import { auditRepo } from "@/server/repositories/audit.repo";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { billingService } from "@/server/services/billing.service";
import { getServices } from "@/server/container";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { Conflict, NotFound } from "@/server/http/errors";
import type { TenantContext } from "@/server/db/tx";
import type { InviteBody } from "@/server/validation/team";

export const teamService = {
  async list(ctx: TenantContext) {
    const members = await userRepo.listByTenant(ctx);
    // never expose internal auth ids
    return members.map((m) => ({
      id: m.id,
      email: m.email,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
    }));
  },

  async invite(ctx: TenantContext, body: InviteBody) {
    await billingService.assertSeatAvailable(ctx); // PAY-05 + PAY-06

    const existing = await userRepo.getByEmail(ctx, body.email);
    if (existing && existing.status !== "removed") {
      throw new Conflict("That email is already a member");
    }

    const member = await userRepo.createMember(ctx, {
      email: body.email,
      role: body.role,
    });

    // Actually tell the person they were invited. Until this existed the row
    // was created and nothing else happened — the UI claimed "they'll get an
    // email" and no email was ever sent by any code path, so every invite
    // silently went nowhere. The signup link is plain (no token): the invite
    // is claimed by matching the verified email on the Supabase JWT at
    // provisioning time (see provisionWorkspace), so a guessed URL grants
    // nothing without control of the mailbox.
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    const workspaceName = tenant?.name ?? "a TalScout workspace";
    const signupUrl = `${getEnv().APP_URL.replace(/\/$/, "")}/signup`;
    let emailSent = true;
    try {
      await getServices().mailer.send({
        to: member.email,
        subject: `You've been invited to join ${workspaceName} on TalScout`,
        text: [
          `You've been invited to join ${workspaceName} on TalScout as a ${body.role}.`,
          "",
          `Create your account here to accept: ${signupUrl}`,
          "",
          `Sign up with this exact email address (${member.email}) — that's how you're matched to the workspace.`,
        ].join("\n"),
      });
    } catch (err) {
      // The member row is already created and the seat already reserved, so
      // a mail-provider hiccup must not fail the whole invite. Report it back
      // instead, so the UI can tell the admin the truth and offer the link to
      // share manually rather than claiming an email went out.
      logger.error({ err, tenantId: ctx.tenantId }, "team_invite_email_failed");
      emailSent = false;
    }

    await auditRepo.log(ctx, {
      action: "team.invite",
      targetType: "user",
      targetId: member.id,
      metadata: { role: body.role, emailSent },
    });
    return {
      id: member.id,
      email: member.email,
      role: member.role,
      status: member.status,
      emailSent,
      signupUrl,
    };
  },

  async remove(ctx: TenantContext, userId: string) {
    const target = await userRepo.getById(ctx, userId);
    if (!target) throw new NotFound("Member not found");
    if (target.status === "removed") return { removed: true }; // idempotent

    // RBAC-03: never remove the last active admin (lockout prevention).
    if (target.role === "admin") {
      const admins = await userRepo.countActiveAdmins(ctx);
      if (admins <= 1) throw new Conflict("Cannot remove the last admin");
    }

    await userRepo.setStatus(ctx, userId, "removed"); // PAY-07: frees a seat
    await auditRepo.log(ctx, {
      action: "team.remove",
      targetType: "user",
      targetId: userId,
    });
    return { removed: true };
  },
};
