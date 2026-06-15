import { candidateRepo } from "@/server/repositories/candidate.repo";
import { getServices } from "@/server/container";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { planHasCapability } from "@/lib/plans";
import type { TenantContext } from "@/server/db/tx";
import type { SearchInput } from "@/server/validation/search";

export const searchService = {
  async search(ctx: TenantContext, input: SearchInput) {
    const q = (input.q ?? "").trim();

    // Semantic search (core) is on every plan; structured filters are Growth+.
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    const advanced = planHasCapability(tenant?.plan || "starter", "advanced_filters");

    const queryVector =
      q.length > 0 ? await getServices().embedder.embed(q) : undefined;

    const rows = await candidateRepo.search(ctx, {
      queryVector,
      limit: input.limit,
      location: advanced ? input.location : undefined,
      minExperience: advanced ? input.minExperience : undefined,
      skills: advanced ? input.skills : undefined,
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

    return {
      results,
      count: results.length,
      query: q || null,
      advancedFilters: advanced,
    };
  },
};
