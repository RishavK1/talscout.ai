import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/**
 * Composes a primary (free) lead-discovery source with an optional secondary
 * fallback — the secondary is only ever called to TOP UP a short primary
 * result, never as the first choice. In container.ts, `secondary` is
 * `undefined` unless GOOGLE_PLACES_API_KEY is configured, so no Google
 * Places code path is reachable without it — this class has no import-time
 * or construction-time dependency on that adapter existing.
 */
export class FallbackLeadDiscovery implements LeadDiscovery {
  constructor(
    private primary: LeadDiscovery,
    private secondary?: LeadDiscovery,
  ) {}

  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    const primaryResults = await this.primary.discover(query);
    if (!this.secondary || primaryResults.length >= query.limit) {
      return primaryResults;
    }
    const seen = new Set(primaryResults.map((l) => l.sourcePlaceId));
    const remaining = query.limit - primaryResults.length;
    const secondaryResults = await this.secondary.discover({ ...query, limit: remaining });
    const deduped = secondaryResults.filter((l) => !seen.has(l.sourcePlaceId));
    return [...primaryResults, ...deduped];
  }
}
