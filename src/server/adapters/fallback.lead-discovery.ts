import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/** An always-consulted discovery source given a reserved slice of the pool
 *  up front, rather than only firing to top up a short result (see
 *  `augmenters` below) — e.g. AI-driven discovery, which the founder wants
 *  to actively contribute leads even when the geometry-based sources alone
 *  already fill the pool, not just rescue a sparse run. */
export interface DiscoveryAugmenter {
  source: LeadDiscovery;
  reservedSlots: number;
}

/**
 * Composes a primary (free) lead-discovery source with an ordered list of
 * fallbacks — each fallback is only ever called to TOP UP a short result
 * from everything tried before it, never as the first choice, and the chain
 * stops as soon as the limit is met. In container.ts, fallbacks are built
 * from an array that's empty/short unless their respective API keys are
 * configured (e.g. Google Places only ever appears in the array — and is
 * only ever constructed — when GOOGLE_PLACES_API_KEY is set), so no
 * unconfigured provider's code path is ever reachable.
 *
 * `augmenters` is a distinct, always-consulted third tier (default `[]`,
 * existing 2-arg callers/tests unaffected): each is given its own reserved
 * slice of the pool up front, consulted unconditionally rather than only
 * when the primary+fallbacks result is short, then merged in — bounded by
 * a final `.slice(0, query.limit)` so an augmenter can never push the total
 * past the caller's requested count.
 */
export class FallbackLeadDiscovery implements LeadDiscovery {
  constructor(
    private primary: LeadDiscovery,
    private fallbacks: LeadDiscovery[] = [],
    private augmenters: DiscoveryAugmenter[] = [],
  ) {}

  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    // Actually RESERVE augmenter capacity by shrinking what primary+
    // fallbacks are asked for, rather than appending augmenter results
    // afterward and truncating — the latter would let a primary source that
    // alone already fills `query.limit` silently crowd every augmenter
    // result back out at the final slice, defeating "always consulted."
    const totalReserved = this.augmenters.reduce(
      (sum, a) => sum + Math.max(0, a.reservedSlots),
      0,
    );
    const primaryLimit = Math.max(query.limit - totalReserved, 0);

    const results = await this.primary.discover({ ...query, limit: primaryLimit });
    const seen = new Set(results.map((l) => l.sourcePlaceId));

    // Businesses an earlier run already found. Filtered centrally here so a
    // provider that doesn't implement `excludeSourcePlaceIds` itself still
    // can't spend this chain's remaining budget re-returning known results —
    // which would leave a repeat run reporting "full" while contributing
    // nothing new. See the field's doc comment in ports/index.ts.
    const known = query.excludeSourcePlaceIds ?? new Set<string>();

    for (const fallback of this.fallbacks) {
      if (results.length >= primaryLimit) break;
      const remaining = primaryLimit - results.length;
      const topUp = await fallback.discover({ ...query, limit: remaining });
      for (const lead of topUp) {
        if (seen.has(lead.sourcePlaceId) || known.has(lead.sourcePlaceId)) continue;
        seen.add(lead.sourcePlaceId);
        results.push(lead);
        if (results.length >= primaryLimit) break;
      }
    }

    for (const { source, reservedSlots } of this.augmenters) {
      const slots = Math.min(Math.max(reservedSlots, 0), query.limit);
      if (slots <= 0) continue;
      const extra = await source.discover({ ...query, limit: slots });
      for (const lead of extra) {
        if (seen.has(lead.sourcePlaceId) || known.has(lead.sourcePlaceId)) continue;
        seen.add(lead.sourcePlaceId);
        results.push(lead);
      }
    }

    // Hard ceiling — defensive only; the reservation above already keeps
    // primary+fallbacks+augmenters within budget under normal operation.
    return results.slice(0, query.limit);
  }
}
