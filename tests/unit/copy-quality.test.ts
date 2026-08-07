import { describe, expect, it } from "vitest";
import { referencesWebsiteContent } from "@/server/lib/copy-quality";

const SITE_EXCERPT =
  "We specialize in a robotics enrichment program for grades 6 through 9, " +
  "run by our onsite engineering faculty every semester.";

describe("referencesWebsiteContent", () => {
  it("true when the draft shares a distinctive word with the website excerpt", () => {
    const body = "Hi team, I noticed your robotics program for grades 6-9 — would love to chat.";
    expect(referencesWebsiteContent(body, SITE_EXCERPT)).toBe(true);
  });

  it("false for a generic draft that shares nothing with the excerpt", () => {
    const body = "Hi team, hope you're doing great. Worth a quick chat about our services?";
    expect(referencesWebsiteContent(body, SITE_EXCERPT)).toBe(false);
  });

  it("ignores common English words when matching — a shared 'business'/'website' doesn't count", () => {
    const body = "Hi team, hope your business and website are doing great this season.";
    const excerpt = "Our business has grown a lot and our website gets great traffic these days.";
    expect(referencesWebsiteContent(body, excerpt)).toBe(false);
  });

  it("false when the excerpt is empty", () => {
    expect(referencesWebsiteContent("mentions robotics program", "")).toBe(false);
  });
});
