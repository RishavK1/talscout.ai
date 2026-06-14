import { candidateRepo } from "@/server/repositories/candidate.repo";
import { getServices } from "@/server/container";
import type { TenantContext } from "@/server/db/tx";
import type { SearchInput } from "@/server/validation/search";

export const searchService = {
  async search(ctx: TenantContext, input: SearchInput) {
    const q = (input.q ?? "").trim();
    // Only embed when there is a real query (SRCH-01/02).
    const queryVector = q.length > 0 ? await getServices().embedder.embed(q) : undefined;

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
