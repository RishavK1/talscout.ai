import { describe, expect, it, vi, beforeEach } from "vitest";

let apiKey: string | undefined = "test-perplexity-primary-key";
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ PERPLEXITY_API_KEY_PRIMARY: apiKey }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { PerplexityOutreachCopywriter } = await import("@/server/adapters/perplexity.outreach-copywriter");

function chatResponse(body: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
  };
}

const baseInput = {
  blueprint: {
    whoWeAre: "Acme Co.",
    whatWeOffer: "A scheduling tool",
    whoItsFor: "Small agencies",
    differentiator: "Faster onboarding",
    painWeSolve: "Manual scheduling",
    proof: [],
    personas: [],
    voice: "Friendly and direct",
    objections: [],
    rules: [],
  },
  lead: { businessName: "Acme Dental" },
};

beforeEach(() => {
  fetchMock.mockReset();
  apiKey = "test-perplexity-primary-key";
});

describe("PerplexityOutreachCopywriter", () => {
  it("throws when PERPLEXITY_API_KEY_PRIMARY isn't configured — never silently returns mock copy", async () => {
    apiKey = undefined;
    const writer = new PerplexityOutreachCopywriter();
    await expect(writer.generateEmail(baseInput)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns subject/body parsed from a valid response", async () => {
    fetchMock.mockResolvedValueOnce(chatResponse({ subject: "Quick question", body: "Hi there..." }));
    const writer = new PerplexityOutreachCopywriter();
    const result = await writer.generateEmail(baseInput);
    expect(result).toEqual({ subject: "Quick question", body: "Hi there..." });
  });

  it("retries the lighter sonar model when sonar-pro fails, same as every other PERPLEXITY_API_KEY_PRIMARY adapter", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(chatResponse({ subject: "Quick question", body: "Hi there..." }));
    const writer = new PerplexityOutreachCopywriter();
    const result = await writer.generateEmail(baseInput);
    expect(result.subject).toBe("Quick question");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws (never returns partial copy) when the response is missing subject/body", async () => {
    fetchMock.mockResolvedValue(chatResponse({ subject: "Only a subject" }));
    const writer = new PerplexityOutreachCopywriter();
    await expect(writer.generateEmail(baseInput)).rejects.toThrow();
  });
});
