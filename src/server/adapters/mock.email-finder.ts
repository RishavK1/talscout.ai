import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/** Deterministic mock — no network. Test sentinels in `businessName`:
 *  `%%NOEMAIL%%` exercises the "no email found" exclusion path (a total
 *  miss — no rung, including AI, finds anything), `%%THROW%%` exercises
 *  provider-failure handling upstream, `%%AIEMAIL%%` simulates "every free
 *  rung missed, only the last-resort AI rung hit" (source: "perplexity"),
 *  `%%PERSONEMAIL%%` simulates finding a named individual (contact tier
 *  "person") rather than a generic shared inbox — this class is used
 *  directly as `emailFinder` in APP_MODE=mock (see container.ts), so a
 *  single class simulates the whole waterfall's outcome rather than needing
 *  a separate mock per rung. */
export class MockEmailFinder implements EmailFinder {
  async find(args: {
    website?: string;
    businessName: string;
    budgetScopeId?: string;
  }): Promise<EmailFinderResult | null> {
    if (args.businessName.includes("%%THROW%%")) {
      throw new Error("mock email finder provider failure");
    }
    if (args.businessName.includes("%%NOEMAIL%%")) return null;
    const slug =
      args.businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "mock";
    if (args.businessName.includes("%%AIEMAIL%%")) {
      return { email: `ai-found@${slug}.example.com`, source: "perplexity", confidence: 60 };
    }
    if (args.businessName.includes("%%PERSONEMAIL%%")) {
      return { email: `jane.doe@${slug}.example.com`, source: "site_scrape", confidence: 95 };
    }
    return { email: `contact@${slug}.example.com`, source: "site_scrape", confidence: 90 };
  }
}
