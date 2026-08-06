import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/lib/geocode", () => ({
  resolveCenterViaNominatim: async () => ({ lat: 19.076, lon: 72.8777 }),
  GEOCODE_USER_AGENT: "TalScout/1.0 (test)",
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { OverpassLeadDiscovery } = await import("@/server/adapters/overpass.lead-discovery");

beforeEach(() => {
  fetchMock.mockReset();
});

describe("OverpassLeadDiscovery — category tag mapping", () => {
  it("regression: 'education' maps to real OSM school/college/university tags, not a nonexistent amenity=education/shop=education", async () => {
    // Real production incident: "Education" fell through to the unmapped
    // fallback (shop=education / amenity=education — neither is a real OSM
    // tag), so the query body queried tags that can never match anything,
    // silently returning zero leads for an otherwise-healthy campaign.
    // mockResolvedValue (not Once): discover() escalates through multiple
    // radii for a free-text location, each a separate fetch call — every
    // one must resolve immediately, or the adapter's real retry/backoff
    // logic kicks in and blows past the test timeout.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [] }),
    });

    const discovery = new OverpassLeadDiscovery();
    await discovery.discover({
      category: "Education",
      location: { text: "Mumbai" },
      limit: 25,
    });

    expect(fetchMock).toHaveBeenCalled();
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain('"amenity"="school"');
    expect(body).toContain('"amenity"="college"');
    expect(body).toContain('"amenity"="university"');
    expect(body).not.toContain('"amenity"="education"');
    expect(body).not.toContain('"shop"="education"');
  });
});
