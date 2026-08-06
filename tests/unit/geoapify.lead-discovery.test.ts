import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ GEOAPIFY_API_KEY: "test-geoapify-key" }),
}));

// Free-text locations resolve to a center via Nominatim first — stub that
// out so this test's fetch mock only ever has to model the Geoapify Places
// endpoint itself.
vi.mock("@/server/lib/geocode", () => ({
  resolveCenterViaNominatim: async () => ({ lat: 30.27, lon: -97.74 }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { GeoapifyLeadDiscovery } = await import("@/server/adapters/geoapify.lead-discovery");

function featureResponse(ids: string[]) {
  return {
    ok: true,
    json: async () => ({
      features: ids.map((id) => ({
        properties: { place_id: id, name: `Business ${id}`, lat: 30.27, lon: -97.74 },
      })),
    }),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("GeoapifyLeadDiscovery — known-aware radius escalation", () => {
  it("escalates to a wider radius when the inner radius returns only already-known businesses", async () => {
    // First (10km) call returns only businesses the caller already has —
    // without escalation this would return [] and the campaign would look
    // "full" forever on a repeat run, even though wider radii have more.
    fetchMock
      .mockResolvedValueOnce(featureResponse(["known-1", "known-2"]))
      .mockResolvedValueOnce(featureResponse(["new-1", "new-2"]));

    const discovery = new GeoapifyLeadDiscovery();
    const result = await discovery.discover({
      category: "restaurant",
      location: { text: "Austin, TX" },
      limit: 2,
      excludeSourcePlaceIds: new Set(["geoapify:known-1", "geoapify:known-2"]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.map((l) => l.sourcePlaceId).sort()).toEqual(["geoapify:new-1", "geoapify:new-2"]);
  });

  it("stops escalating once the limit is satisfied", async () => {
    fetchMock.mockResolvedValueOnce(featureResponse(["a", "b", "c"]));

    const discovery = new GeoapifyLeadDiscovery();
    const result = await discovery.discover({
      category: "restaurant",
      location: { text: "Austin, TX" },
      limit: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.length).toBe(2);
  });

  it("a fixed radiusMeters query never escalates beyond that one radius", async () => {
    fetchMock.mockResolvedValueOnce(featureResponse(["known-1"]));

    const discovery = new GeoapifyLeadDiscovery();
    const result = await discovery.discover({
      category: "restaurant",
      location: { lat: 30.27, lon: -97.74, radiusMeters: 5000 },
      limit: 5,
      excludeSourcePlaceIds: new Set(["geoapify:known-1"]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });
});
