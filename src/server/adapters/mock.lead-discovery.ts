import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

/** Deterministic fixture businesses for APP_MODE=mock + tests — no network.
 *  Test sentinel: `%%THROW%%` in `category` simulates a provider failure. */
export class MockLeadDiscovery implements LeadDiscovery {
  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    if (query.category.includes("%%THROW%%")) {
      throw new Error("mock lead discovery provider failure");
    }
    const count = Math.min(query.limit, 5);
    return Array.from({ length: count }, (_, i) => ({
      sourcePlaceId: `mock:${query.category}:${i}`,
      name: `${query.category} Business ${i + 1}`,
      category: query.category,
      address: "123 Mock St",
      phone: "+15555550100",
      website: `https://mock-business-${i + 1}.example.com`,
      lat: 30.27 + i * 0.001,
      lon: -97.74 + i * 0.001,
    }));
  }
}
