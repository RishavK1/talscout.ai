import type { SiteTextFetcher } from "@/server/ports";

/** Deterministic mock — no network. Returns "" (simulating "unreachable/no
 *  content") for every URL EXCEPT one containing the `%%SITETEXT%%`
 *  sentinel, which returns fixed, distinctive fixture text — lets tests
 *  exercise the "website content actually personalizes the email" path
 *  without any real fetch, while every other test's leads (whose fake
 *  `https://mock-business-N.example.com` URLs never resolve) see the same
 *  "found nothing" behavior a real fetch would produce for them anyway. */
const FIXTURE_TEXT =
  "We specialize in a robotics enrichment program for grades 6 through 9, " +
  "run by our onsite engineering faculty every semester.";

export class MockSiteTextFetcher implements SiteTextFetcher {
  async fetchText(url: string): Promise<string> {
    if (url.includes("%%SITETEXT%%")) return FIXTURE_TEXT;
    return "";
  }
}
