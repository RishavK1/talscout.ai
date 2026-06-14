import type { ResumeExtractor, ExtractedProfile } from "@/server/ports";

/**
 * Deterministic mock extractor. It parses ONLY structured `Key: value` lines —
 * exactly the discipline a prompt-injection-hardened real extractor must have:
 * it treats the document as data and never "follows" instruction-like text
 * embedded in the résumé (AI-01).
 *
 * Test sentinels: `%%THROW%%` simulates a provider failure (AI-03);
 * `%%FORCE_BAD%%` simulates malformed/incomplete output (AI-02).
 */
export class MockExtractor implements ResumeExtractor {
  async extract(text: string): Promise<ExtractedProfile> {
    if (text.includes("%%THROW%%")) {
      throw new Error("mock extractor provider failure");
    }
    const get = (label: string): string | undefined => {
      const m = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "mi"));
      return m?.[1]?.trim();
    };
    if (text.includes("%%FORCE_BAD%%")) {
      return { summary: "unparseable" }; // no fullName → fails schema
    }
    const name = get("Name");
    const email = get("Email");
    return {
      fullName: name,
      currentTitle: get("Title"),
      location: get("Location"),
      emails: email ? [email] : undefined,
      skills: get("Skills")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      summary: get("Summary") ?? (name ? `Profile for ${name}` : undefined),
    };
  }
}
