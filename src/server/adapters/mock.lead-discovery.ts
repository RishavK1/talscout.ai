import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/** Deterministic fixture businesses for APP_MODE=mock + tests — no network.
 *  Test sentinels (in `category`): `%%THROW%%` simulates a provider failure;
 *  `%%NOWEBSITE%%` omits the `website` field entirely (for lead-qualification
 *  tests exercising the "no website" cheap path); `%%POLISHED%%` embeds a
 *  marker in the website URL that MockLeadQualifier reads as "this site
 *  already looks professional" (disqualified, for the "no_or_weak_site" +
 *  website-present path that needs a real qualifier call). */
export class MockLeadDiscovery implements LeadDiscovery {
  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    if (query.category.includes("%%THROW%%")) {
      throw new Error("mock lead discovery provider failure");
    }
    const noWebsite = query.category.includes("%%NOWEBSITE%%");
    const polished = query.category.includes("%%POLISHED%%");
    const count = Math.min(query.limit, 5);
    return Array.from({ length: count }, (_, i) => ({
      sourcePlaceId: `mock:${query.category}:${i}`,
      name: `${query.category} Business ${i + 1}`,
      category: query.category,
      address: "123 Mock St",
      phone: "+15555550100",
      ...(noWebsite
        ? {}
        : { website: `https://mock-business-${i + 1}${polished ? "-%%POLISHED%%" : ""}.example.com` }),
      lat: 30.27 + i * 0.001,
      lon: -97.74 + i * 0.001,
    }));
  }
}
