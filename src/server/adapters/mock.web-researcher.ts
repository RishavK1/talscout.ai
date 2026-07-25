import type { WebResearcher } from "@/server/ports";

/** Deterministic mock for APP_MODE=mock + tests — no key, no network. Always
 *  returns null (the same "nothing found" path the real adapter takes when
 *  PERPLEXITY_API_KEY is unset), so blueprint generation degrades to plain
 *  site-text fetch exactly as it did before this port existed. */
export class MockWebResearcher implements WebResearcher {
  async research(): Promise<string | null> {
    return null;
  }
}
