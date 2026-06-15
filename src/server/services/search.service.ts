import { candidateRepo, clampLimit } from "@/server/repositories/candidate.repo";
import { getServices } from "@/server/container";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { planHasCapability } from "@/lib/plans";
import { logger } from "@/server/observability/logger";
import type { TenantContext } from "@/server/db/tx";
import type { SearchInput } from "@/server/validation/search";
import type { RerankDocument } from "@/server/ports";

/** How many candidates the vector stage hands to the reranker. Wider than the
 *  user's page so the LLM can promote a great-but-not-closest-cosine match. */
const RETRIEVE_K = 50;

/** Flatten a candidate row into the plain text the reranker reads. Mirrors the
 *  signal we embed, so the model judges the whole professional profile. */
function profileText(r: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const parts: (string | null)[] = [
    s(r.fullName),
    s(r.currentTitle),
    s(r.location),
    r.yearsExperience != null ? `${r.yearsExperience} years experience` : null,
    s(r.summary),
    arr(r.skills).length ? `Skills: ${arr(r.skills).join(", ")}` : null,
    arr(r.certifications).length ? `Certifications: ${arr(r.certifications).join(", ")}` : null,
  ];
  const work = Array.isArray(r.workHistory) ? r.workHistory : [];
  for (const w of work as Record<string, unknown>[]) {
    const role = [s(w.title), s(w.company)].filter(Boolean).join(" at ");
    if (role) parts.push(role);
  }
  return parts.filter(Boolean).join("\n");
}

export const searchService = {
  async search(ctx: TenantContext, input: SearchInput) {
    const q = (input.q ?? "").trim();

    // Semantic search (core) is on every plan; structured filters are Growth+.
    const tenant = await tenantRepo.getByIdAdmin(ctx.tenantId);
    const advanced = planHasCapability(tenant?.plan || "starter", "advanced_filters");

    const finalLimit = clampLimit(input.limit);
    const hasQuery = q.length > 0;

    // Stage 1 — vector retrieval. Embed the query on the QUERY side (asymmetric
    // retrieval) and pull a wide candidate pool so the reranker has room to work.
    const queryVector = hasQuery
      ? await getServices().embedder.embed(q, "query")
      : undefined;

    const rows = await candidateRepo.search(ctx, {
      queryVector,
      // Retrieve wide when we'll rerank; otherwise just the page.
      limit: hasQuery ? Math.max(RETRIEVE_K, finalLimit) : finalLimit,
      location: advanced ? input.location : undefined,
      minExperience: advanced ? input.minExperience : undefined,
      skills: advanced ? input.skills : undefined,
    });

    // Stage 2 — LLM rerank. The model reads each shortlisted profile and scores
    // true fit, demoting incidental keyword matches. Falls back to vector order
    // on any failure so search never goes down.
    let ordered = rows;
    let reasons = new Map<string, string | undefined>();
    let reranked = false;

    if (hasQuery && rows.length > 1) {
      try {
        const docs: RerankDocument[] = rows.map((r) => ({
          id: r.id as string,
          text: profileText(r as Record<string, unknown>),
        }));
        const ranked = await getServices().reranker.rerank(q, docs);
        const scoreById = new Map(ranked.map((x) => [x.id, x.score]));
        reasons = new Map(ranked.map((x) => [x.id, x.reason]));
        ordered = [...rows].sort((a, b) => {
          const sa = scoreById.get(a.id as string) ?? 0;
          const sb = scoreById.get(b.id as string) ?? 0;
          return sb - sa;
        });
        // Surface the reranker's relevance as the displayed match score.
        ordered = ordered.map((r) => ({
          ...r,
          score: scoreById.get(r.id as string) ?? r.score,
        }));
        reranked = true;
      } catch (err) {
        logger.warn({ err }, "rerank_failed_falling_back_to_vector_order");
      }
    }

    const top = ordered.slice(0, finalLimit);

    const qLower = q.toLowerCase();
    const results = top.map((r) => ({
      ...r,
      score: r.score == null ? null : Number(r.score),
      matchReason: reasons.get(r.id as string),
      // "why matched" chips: skills that appear in the query text.
      matchedSkills: ((r.skills as string[] | null) ?? []).filter((s) =>
        qLower.includes(s.toLowerCase()),
      ),
    }));

    return {
      results,
      count: results.length,
      query: q || null,
      advancedFilters: advanced,
      reranked,
    };
  },
};
