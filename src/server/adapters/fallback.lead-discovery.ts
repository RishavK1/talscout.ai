import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/**
 * Composes a primary (free) lead-discovery source with an ordered list of
 * fallbacks — each fallback is only ever called to TOP UP a short result
 * from everything tried before it, never as the first choice, and the chain
 * stops as soon as the limit is met. In container.ts, fallbacks are built
 * from an array that's empty/short unless their respective API keys are
 * configured (e.g. Google Places only ever appears in the array — and is
 * only ever constructed — when GOOGLE_PLACES_API_KEY is set), so no
 * unconfigured provider's code path is ever reachable.
 */
export class FallbackLeadDiscovery implements LeadDiscovery {
  constructor(
    private primary: LeadDiscovery,
    private fallbacks: LeadDiscovery[] = [],
  ) {}

  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    const results = await this.primary.discover(query);
    const seen = new Set(results.map((l) => l.sourcePlaceId));

    // Businesses an earlier run already found. Filtered centrally here so a
    // provider that doesn't implement `excludeSourcePlaceIds` itself still
    // can't spend this chain's remaining budget re-returning known results —
    // which would leave a repeat run reporting "full" while contributing
    // nothing new. See the field's doc comment in ports/index.ts.
    const known = query.excludeSourcePlaceIds ?? new Set<string>();

    for (const fallback of this.fallbacks) {
      if (results.length >= query.limit) break;
      const remaining = query.limit - results.length;
      const topUp = await fallback.discover({ ...query, limit: remaining });
      for (const lead of topUp) {
        if (seen.has(lead.sourcePlaceId) || known.has(lead.sourcePlaceId)) continue;
        seen.add(lead.sourcePlaceId);
        results.push(lead);
        if (results.length >= query.limit) break;
      }
    }
    return results;
  }
}
