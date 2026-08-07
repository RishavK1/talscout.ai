import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/** Deterministic fixture businesses for APP_MODE=mock + tests — no network.
 *  Test sentinels (in `category`): `%%THROW%%` simulates a provider failure;
 *  `%%NOWEBSITE%%` omits the `website` field entirely (for lead-qualification
 *  tests exercising the "no website" cheap path); `%%POLISHED%%` embeds a
 *  marker in the website URL that MockLeadQualifier reads as "this site
 *  already looks professional" (disqualified, for the "no_or_weak_site" +
 *  website-present path that needs a real qualifier call); `%%OSMEMAIL%%`
 *  gives the FIRST business an `email` field, simulating a real OSM listing
 *  publishing its own contact email — the "born ready, no enrichment
 *  needed" path (see discoverPhase in run-automated-campaign.ts). Embedded
 *  in the email itself is whatever the caller wants checked against it
 *  downstream (e.g. "%%OSMEMAIL%%-invalidmx" to also exercise the MX gate
 *  on this path specifically). */
/** How many distinct businesses the mock "area" contains in total, and how
 *  many it will hand back in any single call. A FINITE universe larger than
 *  one page is deliberate: it models the two behaviors that matter and used
 *  to be untestable — a repeat run must reach genuinely NEW businesses, and
 *  a campaign must eventually exhaust its area rather than pretending there's
 *  always more. */
const MOCK_UNIVERSE_SIZE = 12;
const MOCK_PAGE_SIZE = 5;
/** How many `ai:mock:...` sentinel leads discover() mixes in when
 *  `query.aiDiscoveryEnabled` is true — mirrors the real
 *  PerplexityLeadDiscovery's reserved-slot slice (see
 *  fallback.lead-discovery.ts's `augmenters`) without needing a separate
 *  mock class or FallbackLeadDiscovery wiring in APP_MODE=mock, where this
 *  class is used directly as `leadDiscovery` (see container.ts). */
const MOCK_AI_SLOTS = 3;

export class MockLeadDiscovery implements LeadDiscovery {
  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    if (query.category.includes("%%THROW%%")) {
      throw new Error("mock lead discovery provider failure");
    }
    const noWebsite = query.category.includes("%%NOWEBSITE%%");
    const polished = query.category.includes("%%POLISHED%%");
    const weakSite = query.category.includes("%%WEAKSITE%%");
    const osmEmail = query.category.includes("%%OSMEMAIL%%");
    // Distinct from the top-level %%THROW%% (which simulates DISCOVERY
    // itself failing) — this embeds a %%THROW%% marker into the generated
    // WEBSITE only, which MockLeadQualifier reads to simulate the
    // QUALIFIER call failing instead.
    const qualifierThrow = query.category.includes("%%QUALIFIERTHROW%%");
    // Embedded in the generated website URL — read by MockSiteTextFetcher to
    // return real fixture text instead of "" (simulating a real business
    // whose site actually has content), so tests can exercise copy
    // generation's website-personalization path.
    const siteText = query.category.includes("%%SITETEXT%%");
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
          : {
              website: `https://mock-business-${i + 1}${polished ? "-%%POLISHED%%" : ""}${weakSite ? "-%%WEAKSITE%%" : ""}${siteText ? "-%%SITETEXT%%" : ""}${qualifierThrow ? "-%%THROW%%" : ""}.example.com`,
            }),
        // Only the first business in the page gets one — mirrors a real
        // area where an OSM email tag is the exception, not the norm.
        ...(osmEmail && i === 0
          ? { email: `hello@osm-tagged-business${query.category.includes("%%INVALIDMX%%") ? "-invalidmx" : ""}.example.com` }
          : {}),
        lat: 30.27 + i * 0.001,
        lon: -97.74 + i * 0.001,
      });
    }

    // Absent/false MUST add zero AI-sourced leads — the same structural
    // guarantee the real PerplexityLeadDiscovery gives (see its doc comment
    // and ports/index.ts's LeadDiscoveryQuery.aiDiscoveryEnabled).
    if (query.aiDiscoveryEnabled) {
      for (let i = 0; i < MOCK_AI_SLOTS && out.length < query.limit; i++) {
        const sourcePlaceId = `ai:mock:${query.category}:${i}`;
        if (known.has(sourcePlaceId)) continue;
        out.push({
          sourcePlaceId,
          name: `${query.category} AI-Found Business ${i + 1}`,
          category: query.category,
          address: "456 Mock Ave",
          website: `https://mock-ai-business-${i + 1}.example.com`,
          lat: 30.28 + i * 0.001,
          lon: -97.75 + i * 0.001,
        });
      }
    }

    return out;
  }
}
