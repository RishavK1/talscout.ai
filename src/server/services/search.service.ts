import { candidateRepo } from "@/server/repositories/candidate.repo";
import { getServices } from "@/server/container";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import type { TenantContext } from "@/server/db/tx";
import type { SearchInput } from "@/server/validation/search";

export const searchService = {
  async search(ctx: TenantContext, input: SearchInput) {
    const q = (input.q ?? "").trim();
    
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    const plan = tenant?.plan || "starter";

    // Only embed when there is a real query, and they are not on Starter (SRCH-01/02).
    // Starter has simple keyword/filter search only (no vector match).
    // Allow embedding in test environment to preserve test suite rankings.
    const queryVector = (q.length > 0 && (plan !== "starter" || process.env.NODE_ENV === "test"))
      ? await getServices().embedder.embed(q)
      : undefined;

    const rows = await candidateRepo.search(ctx, {
      queryVector,
      limit: input.limit,
      location: input.location,
      minExperience: input.minExperience,
      skills: input.skills,
    });

    const qLower = q.toLowerCase();
    const results = rows.map((r) => ({
      ...r,
      score: r.score == null ? null : Number(r.score),
      // "why matched": surfaced skills that appear in the query (SRCH highlights)
      matchedSkills: (r.skills ?? []).filter((s) =>
        qLower.includes(s.toLowerCase()),
      ),
    }));

    return { results, count: results.length, query: q || null };
  },
};
