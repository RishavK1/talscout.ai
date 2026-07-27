import type { MarketResearcher } from "@/server/ports";

/** Deterministic mock for APP_MODE=mock + tests — no key, no network. Always
 *  returns null (the same "nothing found" path the real adapter takes when
 *  no Perplexity key is configured), so the campaign wizard's Research step
 *  degrades to "no research available" exactly as it would in that case. */
export class MockMarketResearcher implements MarketResearcher {
  async research(): Promise<string | null> {
    return null;
  }
}
