import { describe, expect, it, vi } from "vitest";
import { WaterfallEmailFinder } from "@/server/adapters/waterfall.email-finder";
import type { EmailFinder, EmailFinderResult } from "@/server/ports";

function fakeFinder(result: EmailFinderResult | null | (() => never)): EmailFinder {
  return {
    find: vi.fn(async () => {
      if (typeof result === "function") return result();
      return result;
    }),
  };
}

// Plain 2-part domains — not RFC-reserved ".example.com"/".example.org"
// shapes, which collapse to the same domainLabel() for any business (that
// TLD is not a recognized real-world business domain shape).
const args = { businessName: "Acme Dental", website: "https://acmedental.com" };

describe("WaterfallEmailFinder — contact tiering", () => {
  it("keeps trying past a generic (info@) hit, and uses a later decision-maker result instead", async () => {
    const generic = fakeFinder({ email: "info@acmedental.com", source: "site_scrape" });
    const decisionMaker = fakeFinder({ email: "owner@acmedental.com", source: "hunter" });
    const finder = new WaterfallEmailFinder([generic, decisionMaker]);
    const result = await finder.find(args);
    expect(result?.email).toBe("owner@acmedental.com");
    expect(decisionMaker.find).toHaveBeenCalled();
  });

  it("stops early once a decision-maker (or better) contact is found — later finders are never called", async () => {
    const decisionMaker = fakeFinder({ email: "founder@acmedental.com", source: "site_scrape" });
    const neverCalled = fakeFinder({ email: "irrelevant@acmedental.com", source: "hunter" });
    const finder = new WaterfallEmailFinder([decisionMaker, neverCalled]);
    await finder.find(args);
    expect(neverCalled.find).not.toHaveBeenCalled();
  });

  it("a rejected candidate (e.g. webmaster@) never blocks a later, real candidate", async () => {
    const finder = new WaterfallEmailFinder([
      fakeFinder({ email: "webmaster@acmedental.com", source: "site_scrape" }), // rejected role
      fakeFinder({ email: "jane.doe@acmedental.com", source: "hunter" }), // named person
    ]);
    const result = await finder.find(args);
    expect(result?.email).toBe("jane.doe@acmedental.com");
  });

  it("skips a candidate that fails the identity check, and keeps trying subsequent finders", async () => {
    const wrongBusiness = fakeFinder({ email: "contact@totallyunrelated.org", source: "site_scrape" });
    const good = fakeFinder({ email: "info@acmedental.com", source: "hunter" });
    const finder = new WaterfallEmailFinder([wrongBusiness, good]);
    const result = await finder.find(args);
    expect(result?.email).toBe("info@acmedental.com");
  });

  it("falls back to the best generic candidate when nothing better was ever found", async () => {
    const finder = new WaterfallEmailFinder([
      fakeFinder({ email: "info@acmedental.com", source: "site_scrape" }),
      fakeFinder(null),
    ]);
    const result = await finder.find(args);
    expect(result?.email).toBe("info@acmedental.com");
  });

  it("returns null when every finder misses or every candidate is rejected", async () => {
    const finder = new WaterfallEmailFinder([
      fakeFinder(null),
      fakeFinder({ email: "youremail@yourdomain.com", source: "site_scrape" }), // placeholder, rejected
    ]);
    const result = await finder.find(args);
    expect(result).toBeNull();
  });

  it("never throws — a sub-finder error is caught and the next finder is still tried", async () => {
    const throwing = fakeFinder(() => {
      throw new Error("provider outage");
    });
    const good = fakeFinder({ email: "owner@acmedental.com", source: "hunter" });
    const finder = new WaterfallEmailFinder([throwing, good]);
    await expect(finder.find(args)).resolves.toEqual({ email: "owner@acmedental.com", source: "hunter" });
  });
});
