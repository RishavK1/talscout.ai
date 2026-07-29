import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/** Deterministic fixture businesses for APP_MODE=mock + tests — no network.
 *  Test sentinels (in `category`): `%%THROW%%` simulates a provider failure;
 *  `%%NOWEBSITE%%` omits the `website` field entirely (for lead-qualification
 *  tests exercising the "no website" cheap path); `%%POLISHED%%` embeds a
 *  marker in the website URL that MockLeadQualifier reads as "this site
 *  already looks professional" (disqualified, for the "no_or_weak_site" +
 *  website-present path that needs a real qualifier call). */
/** How many distinct businesses the mock "area" contains in total, and how
 *  many it will hand back in any single call. A FINITE universe larger than
 *  one page is deliberate: it models the two behaviors that matter and used
 *  to be untestable — a repeat run must reach genuinely NEW businesses, and
 *  a campaign must eventually exhaust its area rather than pretending there's
 *  always more. */
const MOCK_UNIVERSE_SIZE = 12;
const MOCK_PAGE_SIZE = 5;

export class MockLeadDiscovery implements LeadDiscovery {
  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    if (query.category.includes("%%THROW%%")) {
      throw new Error("mock lead discovery provider failure");
    }
    const noWebsite = query.category.includes("%%NOWEBSITE%%");
    const polished = query.category.includes("%%POLISHED%%");
    const known = query.excludeSourcePlaceIds ?? new Set<string>();

    // Honor excludeSourcePlaceIds like a real provider paging past what the
    // caller already has. The old mock ignored it and always returned the
    // same first page, which is precisely why the whole suite stayed green
    // while every production campaign silently stalled after its first run.
    const out: DiscoveredLead[] = [];
    for (let i = 0; i < MOCK_UNIVERSE_SIZE && out.length < Math.min(query.limit, MOCK_PAGE_SIZE); i++) {
      const sourcePlaceId = `mock:${query.category}:${i}`;
      if (known.has(sourcePlaceId)) continue;
      out.push({
        sourcePlaceId,
        name: `${query.category} Business ${i + 1}`,
        category: query.category,
        address: "123 Mock St",
        phone: "+15555550100",
        ...(noWebsite
          ? {}
          : { website: `https://mock-business-${i + 1}${polished ? "-%%POLISHED%%" : ""}.example.com` }),
        lat: 30.27 + i * 0.001,
        lon: -97.74 + i * 0.001,
      });
    }
    return out;
  }
}
