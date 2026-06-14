import { userRepo } from "@/server/repositories/user.repo";
import { auditRepo } from "@/server/repositories/audit.repo";
import { billingService } from "@/server/services/billing.service";
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
    await auditRepo.log(ctx, {
      action: "team.invite",
      targetType: "user",
      targetId: member.id,
      metadata: { role: body.role },
    });
    return { id: member.id, email: member.email, role: member.role, status: member.status };
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
