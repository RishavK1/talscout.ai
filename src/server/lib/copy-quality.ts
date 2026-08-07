/**
 * Cheap, free, deterministic check on whether generated Day 0 copy actually
 * drew on the recipient's own website content, or produced the same generic
 * pitch every lead would get regardless of who they are. No AI call — a
 * second AI call to "judge" the first would double generation cost for
 * every single lead; this only spends a second AI call in the rare case the
 * first draft genuinely reads as templated (see run-automated-campaign.ts's
 * generateCopyBatch).
 */

const COMMON_ENGLISH_WORDS = new Set([
  "about", "after", "again", "their", "there", "these", "those", "which",
  "would", "could", "should", "before", "because", "business", "company",
  "website", "contact", "please", "thanks", "thank", "regards", "email",
  "today", "really", "great", "quick", "happy", "looking", "working",
  "reach", "reached", "recently", "current", "currently", "provide",
  "provides", "offering", "offers", "service", "services", "product",
  "products", "people", "member", "members", "team",
]);

function distinctiveWords(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[a-z]{6,}/g) ?? [];
  return new Set(matches.filter((w) => !COMMON_ENGLISH_WORDS.has(w)).slice(0, 300));
}

/** True if `body` contains at least one distinctive (6+ letter, non-common)
 *  word that also appears in `websiteExcerpt` — a cheap proxy for "this
 *  email references something specific to this lead's own site," not just
 *  the blueprint's generic pitch with the business name swapped in. */
export function referencesWebsiteContent(body: string, websiteExcerpt: string): boolean {
  const bodyWords = distinctiveWords(body);
  if (bodyWords.size === 0) return false;
  const siteWords = distinctiveWords(websiteExcerpt);
  for (const w of bodyWords) {
    if (siteWords.has(w)) return true;
  }
  return false;
}
