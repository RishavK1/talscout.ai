import type { EmailFinder, EmailFinderResult } from "@/server/ports";

/** Deterministic mock — no network. Test sentinels in `businessName`:
 *  `%%NOEMAIL%%` exercises the "no email found" exclusion path,
 *  `%%THROW%%` exercises provider-failure handling upstream. */
export class MockEmailFinder implements EmailFinder {
  async find(args: { website?: string; businessName: string }): Promise<EmailFinderResult | null> {
    if (args.businessName.includes("%%THROW%%")) {
      throw new Error("mock email finder provider failure");
    }
    if (args.businessName.includes("%%NOEMAIL%%")) return null;
    const slug =
      args.businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "mock";
    return { email: `contact@${slug}.example.com`, source: "site_scrape", confidence: 90 };
  }
}
