import { describe, expect, it } from "vitest";
import { normalizeProfile } from "../../src/server/ingestion/normalize-profile";

describe("normalizeProfile", () => {
  it("canonicalizes and dedupes skills, preserving display form", () => {
    const out = normalizeProfile({
      fullName: "Jane Doe",
      skills: ["reactjs", "React.js", "  NODE  ", "node.js", "TypeScript"],
    });
    expect(out.skills).toEqual(["React", "Node.js", "TypeScript"]);
  });

  it("lowercases and dedupes emails, trims phones", () => {
    const out = normalizeProfile({
      fullName: "Jane Doe",
      emails: ["Jane@X.com", "jane@x.com", ""],
      phones: ["  +1 555 ", "+1 555"],
    });
    expect(out.emails).toEqual(["jane@x.com"]);
    expect(out.phones).toEqual(["+1 555"]);
  });

  it("derives yearsExperience from work history when missing", () => {
    const out = normalizeProfile({
      fullName: "Jane Doe",
      workHistory: [
        { title: "Senior Eng", startDate: "Jan 2018", endDate: "Present" },
        { title: "Junior Eng", startDate: "2015", endDate: "2018" },
      ],
    });
    // 2015 → current year
    expect(out.yearsExperience).toBe(new Date().getUTCFullYear() - 2015);
  });

  it("clamps an out-of-range provided yearsExperience", () => {
    const out = normalizeProfile({ fullName: "X", yearsExperience: 200 });
    expect(out.yearsExperience).toBe(80);
  });

  it("squishes whitespace in name/title/summary", () => {
    const out = normalizeProfile({
      fullName: "  Jane   Doe ",
      currentTitle: "Senior   Engineer",
    });
    expect(out.fullName).toBe("Jane Doe");
    expect(out.currentTitle).toBe("Senior Engineer");
  });

  it("never invents data — empty arrays become undefined", () => {
    const out = normalizeProfile({ fullName: "X", skills: ["", "  "] });
    expect(out.skills).toBeUndefined();
  });
});
