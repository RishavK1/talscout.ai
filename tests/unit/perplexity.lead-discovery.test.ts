import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RateLimiter, RateLimitResult } from "@/server/ports";

let apiKey: string | undefined = "test-perplexity-key";
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ PERPLEXITY_API_KEY: apiKey }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { PerplexityLeadDiscovery } = await import("@/server/adapters/perplexity.lead-discovery");

function chatResponse(body: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
  };
}

function allowingLimiter(): RateLimiter {
  const result: RateLimitResult = { success: true, limit: 400, remaining: 399, reset: Date.now() + 1000 };
  return { limit: vi.fn().mockResolvedValue(result) };
}

function exhaustedLimiter(): RateLimiter {
  const result: RateLimitResult = { success: false, limit: 400, remaining: 0, reset: Date.now() + 1000 };
  return { limit: vi.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  fetchMock.mockReset();
  apiKey = "test-perplexity-key";
});

const baseQuery = {
  category: "dentist",
  location: { text: "Austin, TX" } as const,
  limit: 10,
  aiDiscoveryEnabled: true,
};

describe("PerplexityLeadDiscovery", () => {
  it("aiDiscoveryEnabled: false makes zero fetch calls — the structural gate", async () => {
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const result = await discovery.discover({ ...baseQuery, aiDiscoveryEnabled: false });
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no PERPLEXITY_API_KEY configured makes zero fetch calls", async () => {
    apiKey = undefined;
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const result = await discovery.discover(baseQuery);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("budget exhausted returns [] without ever calling fetch", async () => {
    const discovery = new PerplexityLeadDiscovery(exhaustedLimiter());
    const result = await discovery.discover(baseQuery);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses valid candidates and hashes a stable ai: sourcePlaceId per domain", async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse({
        candidates: [
          { name: "Smile Dental", website: "https://smiledental.example.com", rationale: "found via search" },
        ],
      }),
    );
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const result = await discovery.discover(baseQuery);
    expect(result).toHaveLength(1);
    expect(result[0].sourcePlaceId).toMatch(/^ai:[0-9a-f]{24}$/);
    expect(result[0].name).toBe("Smile Dental");
    expect(result[0].website).toBe("https://smiledental.example.com/");
  });

  it("the same domain hashes to the same id across two separate calls (dedup stability)", async () => {
    const candidate = { name: "Smile Dental", website: "https://smiledental.example.com" };
    fetchMock
      .mockResolvedValueOnce(chatResponse({ candidates: [candidate] }))
      .mockResolvedValueOnce(chatResponse({ candidates: [candidate] }));
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const first = await discovery.discover(baseQuery);
    const second = await discovery.discover(baseQuery);
    expect(first[0].sourcePlaceId).toBe(second[0].sourcePlaceId);
  });

  it("drops a candidate with no name rather than discarding the whole batch", async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse({
        candidates: [{ website: "https://noname.example.com" }, { name: "Valid Business" }],
      }),
    );
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const result = await discovery.discover(baseQuery);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Valid Business");
  });

  it("skips a candidate whose hash matches an already-known sourcePlaceId", async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse({ candidates: [{ name: "Smile Dental", website: "https://smiledental.example.com" }] }),
    );
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    // Compute the id once to know what to exclude.
    const probe = await discovery.discover(baseQuery);
    const knownId = probe[0].sourcePlaceId;

    fetchMock.mockResolvedValueOnce(
      chatResponse({ candidates: [{ name: "Smile Dental", website: "https://smiledental.example.com" }] }),
    );
    const result = await discovery.discover({
      ...baseQuery,
      excludeSourcePlaceIds: new Set([knownId]),
    });
    expect(result).toEqual([]);
  });

  it("malformed JSON from the model returns [] rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json at all" } }] }),
    });
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const result = await discovery.discover(baseQuery);
    expect(result).toEqual([]);
  });

  it("a non-ok HTTP response returns [] rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const discovery = new PerplexityLeadDiscovery(allowingLimiter());
    const result = await discovery.discover(baseQuery);
    expect(result).toEqual([]);
  });
});
