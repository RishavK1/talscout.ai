import { resolveMx, resolve4, resolve6 } from "node:dns/promises";
import { logger } from "@/server/observability/logger";

/**
 * Cheap, free, no-vendor email-domain check — run right before a lead would
 * be marked "ready" (see run-automated-campaign.ts's discoverPhase and
 * enrichBatch), so an address with a definitely-nonexistent domain (a typo
 * in scraped/OSM-tagged contact data, a dead business's old domain, etc.)
 * never reaches copy generation or a send attempt, where it would show up
 * later as a silent bounce instead.
 *
 * Deliberately NOT a full SMTP-handshake verifier (RCPT TO probing) — most
 * mail servers rate-limit or reject that kind of probe outright, and it
 * would add real latency to every lead. This only answers "can this DOMAIN
 * receive mail at all," which catches the highest-value, lowest-risk class
 * of bad address (nonexistent domain) for zero cost and no new dependency.
 *
 * FAILS OPEN on anything short of definitive proof the domain can't receive
 * mail — a DNS timeout, a resolver hiccup, or any error that isn't a clean
 * "this name doesn't exist" is treated as valid. The cost of wrongly
 * blocking a real lead over a transient DNS blip is much higher than the
 * cost of occasionally letting one bad address through to bounce (which the
 * bounce-detection pass now catches downstream anyway).
 */

const DNS_TIMEOUT_MS = 5_000;

/** Per-process cache — many leads in the same discovery run often share a
 *  small set of email-provider domains (gmail.com, outlook.com, a shared
 *  hosting provider's mail domain). Not persisted across process restarts;
 *  that's fine, this is a cheap check, not a source of truth. */
const domainCache = new Map<string, boolean>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error("dns_lookup_timeout")), ms);
      // Never keep the process alive just for this timer.
      if (typeof t === "object" && "unref" in t) t.unref();
    }),
  ]);
}

type ResolveOutcome = "found" | "no_records" | "ambiguous";

/** Classifies a DNS lookup's result. Only a clean "this name/record type
 *  doesn't exist" (ENOTFOUND/ENODATA) counts as a definitive negative —
 *  everything else (timeout, SERVFAIL, connection refused to the resolver,
 *  etc.) is ambiguous and must not be treated as proof of anything. */
async function tryResolve(fn: () => Promise<unknown[]>): Promise<ResolveOutcome> {
  try {
    const records = await withTimeout(fn(), DNS_TIMEOUT_MS);
    return records.length > 0 ? "found" : "no_records";
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    return code === "ENOTFOUND" || code === "ENODATA" ? "no_records" : "ambiguous";
  }
}

async function domainCanReceiveMail(domain: string): Promise<boolean> {
  const mx = await tryResolve(() => resolveMx(domain));
  if (mx === "found") return true;
  if (mx === "ambiguous") return true; // fail open — couldn't get a real answer

  // No MX records. RFC 5321 §5.1's implicit-MX fallback: a domain with no MX
  // but a working A/AAAA record can still receive mail on that address.
  // Small businesses on shared hosting with no dedicated mail setup are
  // exactly the common real-world case this catches.
  const a = await tryResolve(() => resolve4(domain));
  if (a === "found") return true;
  if (a === "ambiguous") return true;

  const aaaa = await tryResolve(() => resolve6(domain));
  if (aaaa === "found") return true;
  if (aaaa === "ambiguous") return true;

  // Definitive on all three: no MX, no A, no AAAA anywhere for this domain.
  return false;
}

/** True unless the email's domain definitively cannot receive mail. Caching
 *  is per-domain, not per-email — the mailbox-existence question (is
 *  "sales@" a real inbox) is explicitly out of scope, only "does this
 *  domain even resolve to a mail-capable host." */
export async function hasValidMx(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return false; // not even a well-formed address

  const cached = domainCache.get(domain);
  if (cached !== undefined) return cached;

  let valid: boolean;
  try {
    valid = await domainCanReceiveMail(domain);
  } catch (err) {
    // Belt and suspenders — domainCanReceiveMail shouldn't throw (tryResolve
    // catches everything), but a genuinely unexpected failure here must
    // still fail open rather than take down lead enrichment.
    logger.warn({ err, domain }, "mx_check_unexpected_error_failing_open");
    valid = true;
  }
  domainCache.set(domain, valid);
  return valid;
}
