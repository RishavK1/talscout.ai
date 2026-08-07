import { fetchSiteText } from "@/server/lib/safe-fetch";
import type { SiteTextFetcher } from "@/server/ports";

/** Thin port wrapper around safe-fetch.ts's fetchSiteText — free, no key,
 *  always-on. See SiteTextFetcher's doc comment in ports/index.ts for why
 *  this is a port rather than a direct function call. */
export class SafeFetchSiteTextFetcher implements SiteTextFetcher {
  async fetchText(url: string): Promise<string> {
    return fetchSiteText(url);
  }
}
