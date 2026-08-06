import { describe, expect, it } from "vitest";
import { FallbackLeadDiscovery } from "@/server/adapters/fallback.lead-discovery";
import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead } from "@/server/ports";

function fakeSource(leads: DiscoveredLead[]): LeadDiscovery {
  return {
    async discover(query) {
      return leads.slice(0, query.limit);
    },
  };
}

function lead(id: string): DiscoveredLead {
  return { sourcePlaceId: id, name: `Business ${id}` };
}

const baseQuery: LeadDiscoveryQuery = {
  category: "restaurant",
  location: { text: "Austin, TX" },
  limit: 10,
};

describe("FallbackLeadDiscovery — augmenters", () => {
  it("empty augmenters is behavior-neutral (matches pre-augmenter behavior)", async () => {
    const primary = fakeSource([lead("a"), lead("b")]);
    const discovery = new FallbackLeadDiscovery(primary, [], []);
    const result = await discovery.discover(baseQuery);
    expect(result.map((l) => l.sourcePlaceId)).toEqual(["a", "b"]);
  });

  it("consults an augmenter even when the primary alone could have filled the whole pool", async () => {
    // Primary has 10 candidates available — more than enough to fill
    // limit=10 on its own — but a reserved slot for the augmenter means
    // primary is only ever asked for (limit - reservedSlots), leaving real
    // room for the augmenter's result rather than it being appended and
    // immediately truncated away.
    const primary = fakeSource(Array.from({ length: 10 }, (_, i) => lead(`p${i}`)));
    const augmenter = fakeSource([lead("ai-1")]);
    const discovery = new FallbackLeadDiscovery(primary, [], [{ source: augmenter, reservedSlots: 2 }]);
    const result = await discovery.discover({ ...baseQuery, limit: 10 });
    expect(result.some((l) => l.sourcePlaceId === "ai-1")).toBe(true);
  });

  it("never exceeds query.limit even after merging augmenter results", async () => {
    const primary = fakeSource(Array.from({ length: 10 }, (_, i) => lead(`p${i}`)));
    const augmenter = fakeSource([lead("ai-1"), lead("ai-2")]);
    const discovery = new FallbackLeadDiscovery(primary, [], [{ source: augmenter, reservedSlots: 2 }]);
    const result = await discovery.discover({ ...baseQuery, limit: 10 });
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("skips known and already-seen ids from the augmenter", async () => {
    const primary = fakeSource([lead("a")]);
    const augmenter = fakeSource([lead("a"), lead("known-1"), lead("ai-1")]);
    const discovery = new FallbackLeadDiscovery(primary, [], [{ source: augmenter, reservedSlots: 5 }]);
    const result = await discovery.discover({
      ...baseQuery,
      limit: 10,
      excludeSourcePlaceIds: new Set(["known-1"]),
    });
    const ids = result.map((l) => l.sourcePlaceId);
    expect(ids).toEqual(["a", "ai-1"]);
  });

  it("a zero/negative reservedSlots augmenter contributes nothing", async () => {
    const primary = fakeSource([lead("a")]);
    const augmenter = fakeSource([lead("ai-1")]);
    const discovery = new FallbackLeadDiscovery(primary, [], [{ source: augmenter, reservedSlots: 0 }]);
    const result = await discovery.discover(baseQuery);
    expect(result.map((l) => l.sourcePlaceId)).toEqual(["a"]);
  });
});
