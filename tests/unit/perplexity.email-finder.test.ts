import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RateLimiter, RateLimitResult } from "@/server/ports";

let apiKey: string | undefined = "test-perplexity-key";
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ PERPLEXITY_API_KEY: apiKey }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { PerplexityEmailFinder } = await import("@/server/adapters/perplexity.email-finder");

function chatResponse(body: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
  };
}

/** Fake limiter that tracks calls per key so tests can assert per-campaign
 *  vs global scoping independently, and can be made to reject a specific key. */
function fakeLimiter(rejectKeys: Set<string> = new Set()): RateLimiter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    limit: vi.fn(async (key: string) => {
      calls.push(key);
      const success = !rejectKeys.has(key);
      const result: RateLimitResult = { success, limit: 400, remaining: success ? 399 : 0, reset: Date.now() + 1000 };
      return result;
    }),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  apiKey = "test-perplexity-key";
});

describe("PerplexityEmailFinder", () => {
  it("no PERPLEXITY_API_KEY configured never calls fetch or the limiter", async () => {
    apiKey = undefined;
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(limiter.calls).toEqual([]);
  });

  it("global budget exhausted returns null without calling fetch", async () => {
    const limiter = fakeLimiter(new Set(["ai-email-finder:tick"]));
    const finder = new PerplexityEmailFinder(limiter);
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("per-campaign budget exhausted returns null even though the global budget has room", async () => {
    const limiter = fakeLimiter(new Set(["ai-email-finder:tick:campaign-1"]));
    const finder = new PerplexityEmailFinder(limiter);
    const result = await finder.find({ businessName: "Acme Dental", budgetScopeId: "campaign-1" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("one campaign exhausting its own scoped budget doesn't block a different campaign", async () => {
    const limiter = fakeLimiter(new Set(["ai-email-finder:tick:campaign-1"]));
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: "hello@acme.example.com", confidence: 0.8 }));
    const result = await finder.find({ businessName: "Acme Dental", budgetScopeId: "campaign-2" });
    expect(result?.email).toBe("hello@acme.example.com");
  });

  it("no budgetScopeId only checks the global budget", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: "hello@acme.example.com" }));
    await finder.find({ businessName: "Acme Dental" });
    expect(limiter.calls).toEqual(["ai-email-finder:tick"]);
  });

  it("returns a plausible email with source 'perplexity'", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: "hello@acme.example.com", confidence: 0.9 }));
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result).toEqual({ email: "hello@acme.example.com", source: "perplexity", confidence: 90 });
  });

  it("rescales the model's 0-1 confidence to the DB's 0-100 integer scale — regression for a real production bug (0.96 sent straight to an integer column crashed the whole campaign)", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: "hello@acme.example.com", confidence: 0.96 }));
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result?.confidence).toBe(96);
    expect(Number.isInteger(result?.confidence)).toBe(true);
  });

  it("clamps an out-of-range confidence to [0, 100] instead of producing an invalid value", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: "hello@acme.example.com", confidence: 1.5 }));
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result?.confidence).toBe(100);
  });

  it("rejects an implausible email (e.g. an image filename) even if the model returns it", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: "banner.png" }));
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result).toBeNull();
  });

  it("email: null (genuine miss) returns null, never throws", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce(chatResponse({ email: null }));
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result).toBeNull();
  });

  it("a fetch error is swallowed — never throws (hard EmailFinder contract)", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(finder.find({ businessName: "Acme Dental" })).resolves.toBeNull();
  });

  it("a non-ok HTTP response returns null rather than throwing", async () => {
    const limiter = fakeLimiter();
    const finder = new PerplexityEmailFinder(limiter);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await finder.find({ businessName: "Acme Dental" });
    expect(result).toBeNull();
  });
});
