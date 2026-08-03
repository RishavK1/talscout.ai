import { resolveTxt } from "node:dns/promises";
import { logger } from "@/server/observability/logger";

/**
 * Free, no-vendor SPF/DKIM/DMARC lookup for a sending domain — a diagnostic,
 * not a gate: nothing in the send pipeline reads this, it exists purely to
 * surface a real, common cause of cold email landing in spam (missing or
 * misconfigured DNS records) somewhere a user can actually see it before
 * they find out the hard way. See outreach/bulk-fire's sender cards for
 * where this is surfaced.
 *
 * Same fail-open discipline as lib/email-verification.ts: a DNS timeout or
 * resolver hiccup reports "unknown", never "missing" — this is diagnostic
 * information shown to a human, so a false "you're missing DMARC" reading
 * is worse than an honest "couldn't check right now."
 */

const DNS_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error("dns_lookup_timeout")), ms);
      if (typeof t === "object" && "unref" in t) t.unref();
    }),
  ]);
}

export type RecordStatus = "present" | "missing" | "unknown";

export interface DnsRecordCheck {
  status: RecordStatus;
  /** The raw TXT record value, when found — shown so a technical user can
   *  verify it themselves rather than trusting our parsing. */
  record?: string;
}

export interface DkimCheck extends DnsRecordCheck {
  /** Which selector the record was found at (see COMMON_DKIM_SELECTORS) —
   *  DKIM has no fixed, discoverable location the way SPF/DMARC do, so this
   *  is inherently best-effort: "missing" here means "not found at any of
   *  the selectors we know to check," not "definitively absent." */
  selector?: string;
}

export interface DomainDeliverabilityReport {
  domain: string;
  /** True for major consumer webmail domains (gmail.com, outlook.com, …) —
   *  the user has no DNS to configure there at all (the provider owns it),
   *  so SPF/DKIM/DMARC below are omitted entirely rather than shown as
   *  pass/fail against records that aren't the user's to fix. */
  isConsumerProvider: boolean;
  spf?: DnsRecordCheck;
  dmarc?: DnsRecordCheck;
  dkim?: DkimCheck;
}

/** Major consumer webmail providers where SPF/DKIM/DMARC are the
 *  provider's own responsibility, never something a connecting user
 *  configures — checking these would just show "pass" for something the
 *  user has no control over and can mislead them into thinking their OWN
 *  deliverability setup is fine. */
const CONSUMER_PROVIDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "aol.com",
  "icloud.com",
]);

/** Selectors common enough across major ESPs/providers (Google Workspace,
 *  Microsoft 365, generic "default") to be worth a best-effort check. Not
 *  exhaustive — a domain using a custom or provider-specific selector we
 *  don't know about will read "missing" here even if DKIM is genuinely
 *  configured. The UI must present this as best-effort, not authoritative. */
const COMMON_DKIM_SELECTORS = ["google", "selector1", "selector2", "default", "k1", "dkim", "mail"];

async function lookupTxt(hostname: string): Promise<string[]> {
  const records = await withTimeout(resolveTxt(hostname), DNS_TIMEOUT_MS);
  // Node returns each TXT record as string[] (long records are split into
  // multiple <=255-byte chunks by the DNS protocol itself) — join each
  // record back into one string before matching against it.
  return records.map((chunks) => chunks.join(""));
}

/** ENOTFOUND/ENODATA = definitively no such record; anything else
 *  (timeout, resolver error) is ambiguous and must report "unknown". */
function isDefinitiveNoRecord(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

async function checkSpf(domain: string): Promise<DnsRecordCheck> {
  try {
    const txts = await lookupTxt(domain);
    const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1"));
    return spf ? { status: "present", record: spf } : { status: "missing" };
  } catch (err) {
    if (isDefinitiveNoRecord(err)) return { status: "missing" };
    logger.warn({ err, domain }, "spf_lookup_ambiguous");
    return { status: "unknown" };
  }
}

async function checkDmarc(domain: string): Promise<DnsRecordCheck> {
  try {
    const txts = await lookupTxt(`_dmarc.${domain}`);
    const dmarc = txts.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
    return dmarc ? { status: "present", record: dmarc } : { status: "missing" };
  } catch (err) {
    if (isDefinitiveNoRecord(err)) return { status: "missing" };
    logger.warn({ err, domain }, "dmarc_lookup_ambiguous");
    return { status: "unknown" };
  }
}

async function checkDkim(domain: string): Promise<DkimCheck> {
  let sawAmbiguous = false;
  for (const selector of COMMON_DKIM_SELECTORS) {
    try {
      const txts = await lookupTxt(`${selector}._domainkey.${domain}`);
      const dkim = txts.find((t) => t.toLowerCase().includes("v=dkim1") || t.toLowerCase().includes("k="));
      if (dkim) return { status: "present", record: dkim, selector };
    } catch (err) {
      if (!isDefinitiveNoRecord(err)) {
        sawAmbiguous = true;
        logger.warn({ err, domain, selector }, "dkim_lookup_ambiguous");
      }
    }
  }
  // Only report "unknown" (rather than "missing") if EVERY selector we
  // tried hit an ambiguous error — a mix of clean "no such record" misses
  // is still a confident "not found at any selector we know," which is
  // exactly the honest best-effort answer this check can give.
  return sawAmbiguous ? { status: "unknown" } : { status: "missing" };
}

export async function checkDomainDeliverability(domain: string): Promise<DomainDeliverabilityReport> {
  const normalized = domain.trim().toLowerCase();
  if (CONSUMER_PROVIDER_DOMAINS.has(normalized)) {
    return { domain: normalized, isConsumerProvider: true };
  }
  const [spf, dmarc, dkim] = await Promise.all([
    checkSpf(normalized),
    checkDmarc(normalized),
    checkDkim(normalized),
  ]);
  return { domain: normalized, isConsumerProvider: false, spf, dmarc, dkim };
}
