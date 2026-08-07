/**
 * Identity validation for a discovered contact email — the gate that answers
 * "does this address actually belong to THIS business?" before a lead can
 * ever reach copy generation or a send.
 *
 * Added after real production incidents where recipients replied "you sent
 * this to the wrong person". Every failure mode below is taken from a real
 * bad address this pipeline actually produced and would have emailed:
 *
 *   - contact@arigel.com          for somaiya-ayurvihar.org  (the web AGENCY's
 *                                 address, scraped off the site footer)
 *   - youremail@yourdomain.com    for a college (an unfilled template
 *                                 placeholder, marked "ready" to send)
 *   - jmorales@sjcadets.org       for a Mumbai school (a US school's address —
 *                                 an AI search matched a different, same-named
 *                                 institution on the other side of the world)
 *   - devidasahire41@gmail.com    for a municipal school (a private
 *                                 individual's personal inbox, unrelated to
 *                                 the organisation)
 *
 * Deliberately generic: matching is purely structural (name tokens, acronyms,
 * domain shape), with NO hardcoded industry, country, or language terms — a
 * dentist in Austin, a law firm in Dubai and a salon in Manchester are all
 * judged by the same rules as a school in Mumbai.
 *
 * Free and dependency-free — pure string logic, no network, no AI, no cost.
 */

/** Consumer mailbox providers. An address here can still be a business's real
 *  contact (very common for small/local businesses worldwide), but the DOMAIN
 *  carries no identity signal, so the local part must carry it instead. */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me",
  "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "rediffmail.com",
  "hotmail.fr", "yahoo.fr", "web.de", "qq.com", "163.com", "126.com",
]);

/** Reserved/placeholder domains that are NEVER a real business's own domain —
 *  matched EXACTLY (or as a real subdomain of one), never by substring. A
 *  substring match would misfire on any real domain that happens to contain
 *  one of these as a fragment (e.g. "dentist-business.example.com" is not
 *  the reserved example.com — a literal, unrelated domain lower down in the
 *  hierarchy would be, but a business's own domain never legitimately lives
 *  under example.com/test.com in the first place, so this only ever fires
 *  on the genuine placeholder itself). */
const RESERVED_PLACEHOLDER_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "test.com", "domain.com",
  "email.com", "yourdomain.com", "localhost", "invalid",
]);

/** Site-builder/CMS/vendor/error-tracking domains whose addresses turn up in
 *  scraped page markup — these genuinely host many unrelated businesses on
 *  subdomains (mybusiness.wixsite.com), so substring matching is correct and
 *  necessary here, unlike the reserved placeholders above. */
const VENDOR_HOSTING_DOMAINS = [
  "sentry.io", "sentry-next", "wixsite.com", "wixpress", "squarespace",
  "godaddysites", "wordpress.com", "myshopify.com", "weebly.com",
  "webflow.io", "bluehost", "hostgator", "namecheap", "cloudflare",
  "jimdo.com", "hubspot", "mailchimp", "sslip.io",
];

/** Local parts that are placeholders or template leftovers rather than a real
 *  mailbox — an address like youremail@yourdomain.com went out as "ready". */
const PLACEHOLDER_LOCAL_PARTS = new Set([
  "youremail", "yourname", "your-email", "yourmail", "email", "name",
  "example", "test", "testing", "sample", "demo", "placeholder",
  "username", "user", "firstname", "lastname", "someone", "changeme",
]);

/** Addresses that are never a decision-maker and often auto-discard replies —
 *  emailing these reads as spam and wastes the send. */
const REJECTED_ROLE_LOCAL_PARTS = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "postmaster",
  "abuse", "webmaster", "hostmaster", "root", "admin@localhost",
  "mailer-daemon", "bounce", "bounces", "unsubscribe", "spam",
  "privacy", "legal", "dmca", "security", "notifications", "notification",
  "alerts", "automated", "system", "wordpress", "cron",
]);

/** Role mailboxes read by someone with authority to act on an offer. */
const DECISION_MAKER_ROLE_LOCAL_PARTS = new Set([
  "founder", "cofounder", "ceo", "coo", "cto", "cmo", "cfo", "owner",
  "director", "directors", "md", "managingdirector", "principal", "president",
  "partner", "partners", "head", "headteacher", "headmaster", "manager",
  "management", "gm", "proprietor", "chairman", "hr", "people", "recruitment",
  "recruiting", "talent", "careers", "admissions", "registrar", "marketing",
  "bizdev", "partnerships", "sales", "newbusiness",
]);

/** Real mailboxes that reach the business, but are shared/front-desk — the
 *  lowest-yield tier, kept only when nothing better exists. */
const GENERIC_ROLE_LOCAL_PARTS = new Set([
  "info", "contact", "contactus", "hello", "hi", "enquiry", "enquiries",
  "inquiry", "inquiries", "office", "reception", "mail", "email", "general",
  "team", "support", "help", "service", "customerservice", "care",
  "accounts", "accounting", "billing", "finance", "orders", "booking",
  "bookings", "reservations", "appointments", "front desk", "frontdesk",
  "web", "webleads", "leads", "query", "queries", "connect", "communications",
]);

/** Words carrying no identity signal when matching a name against a domain —
 *  intentionally structural/legal/organisational terms only, spanning the
 *  common English forms used in business names worldwide. NOT industry terms:
 *  "dental", "legal", "salon" etc. stay as real matchable signal. */
const NAME_STOPWORDS = new Set([
  "the", "of", "and", "for", "at", "in", "on", "a", "an", "&",
  "ltd", "limited", "llc", "llp", "inc", "incorporated", "corp", "corporation",
  "co", "company", "plc", "pvt", "private", "gmbh", "bv", "sa", "srl", "pty",
  "group", "holdings", "enterprises", "ventures", "services", "solutions",
]);

export type ContactTier =
  /** A named human at the business (jane.doe@acme.com). Highest open rate. */
  | "person"
  /** A role mailbox read by someone with authority (owner@, principal@, hr@). */
  | "decision_maker"
  /** A real but shared front-desk mailbox (info@, contact@). Last resort. */
  | "generic"
  /** Must never be emailed — see `reason`. */
  | "reject";

export interface ContactAssessment {
  tier: ContactTier;
  /** Human-readable justification, persisted on the lead so a user can see
   *  exactly WHY an address was taken or dropped. */
  reason: string;
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at).toLowerCase(), domain: email.slice(at + 1).toLowerCase() };
}

/** Lowercase alphanumeric only — "St. Joseph's High School" -> "stjosephshighschool". */
function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function words(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Identity-bearing words: stopwords dropped, so "Acme Solutions Pvt Ltd"
 *  matches on "acme" rather than on "solutions"/"pvt"/"ltd". */
function significantWords(name: string): string[] {
  return words(name).filter((w) => !NAME_STOPWORDS.has(w));
}

/** First letters of the significant words — how organisations very commonly
 *  form their own domain ("Vidyalankar Institute of Technology" -> vit.edu.in,
 *  "Sheila Raheja Institute of Hotel Management" -> srihm.edu.in). */
function acronym(name: string): string {
  return significantWords(name)
    .map((w) => w[0])
    .join("");
}

/** The registrable-ish label of a hostname: "mail.acme.co.uk" -> "acme".
 *  Deliberately approximate (no PSL dependency) — good enough to compare a
 *  business name against, which is all this is used for. */
export function domainLabel(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  // Walk past common multi-part public suffixes (co.uk, ac.in, edu.in, com.au…)
  const suffixish = new Set([
    "co", "com", "net", "org", "edu", "ac", "gov", "govt", "or", "ne",
    "uk", "in", "au", "nz", "za", "sg", "my", "ae", "sa", "br", "mx", "jp", "cn", "id", "ph",
  ]);
  let i = parts.length - 1;
  while (i > 0 && suffixish.has(parts[i])) i--;
  return parts[i] ?? "";
}

function isFreemail(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.replace(/^www\./, ""));
}

/** Does this string plausibly carry the business's identity? Matches if it
 *  contains the compacted name, contains a significant word (>=4 chars, or an
 *  exact short-token equality), or equals/contains the acronym (>=3 chars). */
function carriesBusinessIdentity(candidate: string, businessName: string): boolean {
  const hay = compact(candidate);
  if (!hay) return false;

  const full = compact(businessName);
  if (full.length >= 4 && (hay.includes(full) || full.includes(hay))) return true;

  for (const w of significantWords(businessName)) {
    if (w.length >= 4 && hay.includes(w)) return true;
    // Short tokens ("ies", "kj", "nm") only count on exact equality, so a
    // 2-3 letter fragment can't accidentally match an unrelated domain.
    if (w.length < 4 && hay === w) return true;
  }

  const acr = acronym(businessName);
  if (acr.length >= 3 && (hay === acr || hay.startsWith(acr) || hay.includes(acr))) return true;

  return false;
}

/** Heuristic "this local part looks like a person's name, not a role" —
 *  jane.doe, j.morales, jsmith, devidasahire41. Used both to PREFER real
 *  humans and to catch a stranger's personal inbox attached to an org. */
export function looksLikePersonName(local: string): boolean {
  const base = local.toLowerCase().replace(/[0-9]+$/, "");
  if (!base || base.length < 3) return false;
  if (
    DECISION_MAKER_ROLE_LOCAL_PARTS.has(base) ||
    GENERIC_ROLE_LOCAL_PARTS.has(base) ||
    REJECTED_ROLE_LOCAL_PARTS.has(base)
  ) {
    return false;
  }
  // firstname.lastname / firstname_lastname / firstname-lastname, including a
  // single-initial first part (j.morales, r-kamboj).
  if (/^[a-z]{1,}[._-][a-z]{2,}$/.test(base)) return true;
  // jsmith / rkamboj — single initial immediately followed by a surname, no
  // separator. Deliberately excludes known role words above (checked first)
  // so a structurally similar word like "webmaster" is never misread as a
  // person just because it starts with a consonant.
  if (/^[a-z]{1}[a-z]{3,}$/.test(base) && !/^[aeiou]/.test(base)) return true;
  return false;
}

/** Best-effort first name from a "person" contact tier's local part —
 *  "jane.doe" -> "Jane", "j.morales" -> null (a single initial isn't a
 *  usable greeting name; never guess). Used to greet a real, named
 *  individual by name instead of a generic "Hello team at X" — only ever
 *  called for addresses that already passed `looksLikePersonName`, so this
 *  never fabricates a name for a role/generic mailbox. */
export function guessFirstName(local: string): string | null {
  const base = local.toLowerCase().replace(/[0-9]+$/, "");
  const match = base.match(/^([a-z]+)[._-][a-z]{2,}$/);
  const first = match?.[1];
  if (!first || first.length < 2) return null;
  return first[0].toUpperCase() + first.slice(1);
}

/**
 * The core gate. Judges an email against the business it's claimed to belong
 * to, returning the tier the caller should act on. `website` (when known) is
 * the strongest signal available and is checked first.
 */
export function assessContact(args: {
  email: string;
  businessName: string;
  website?: string | null;
}): ContactAssessment {
  const parts = splitEmail(args.email.trim());
  if (!parts) return { tier: "reject", reason: "Not a valid email address" };
  const { local, domain } = parts;

  // ---- Hard rejects: never a real, safe recipient ----
  if (RESERVED_PLACEHOLDER_DOMAINS.has(domain) || domain.endsWith(".invalid")) {
    return { tier: "reject", reason: `Reserved/placeholder domain (${domain}), never a real business` };
  }
  if (VENDOR_HOSTING_DOMAINS.some((d) => domain.includes(d))) {
    return { tier: "reject", reason: `Site-builder/vendor domain (${domain}), not the business's own` };
  }
  if (PLACEHOLDER_LOCAL_PARTS.has(local) || local.startsWith("your")) {
    return { tier: "reject", reason: `Unfilled template placeholder (${args.email})` };
  }
  const roleBase = local.replace(/[0-9]+$/, "");
  if (REJECTED_ROLE_LOCAL_PARTS.has(roleBase)) {
    return { tier: "reject", reason: `Automated or non-decision-maker mailbox (${roleBase}@)` };
  }

  const freemail = isFreemail(domain);

  // ---- Identity check: does this address belong to THIS business? ----
  if (!freemail) {
    const emailLabel = domainLabel(domain);
    const siteHost = (args.website ?? "").replace(/^https?:\/\//, "").split("/")[0];
    const siteLabel = siteHost ? domainLabel(siteHost) : "";

    if (siteLabel) {
      // The business's own website is the ground truth. A different domain is
      // how the web-agency address (contact@arigel.com for a school) got in.
      if (emailLabel !== siteLabel && !carriesBusinessIdentity(emailLabel, args.businessName)) {
        return {
          tier: "reject",
          reason: `Email domain (${emailLabel}) doesn't belong to this business (site: ${siteLabel}) — likely an agency, vendor or unrelated organisation`,
        };
      }
    } else if (
      !carriesBusinessIdentity(emailLabel, args.businessName) &&
      // Fallback candidate: the domainLabel heuristic assumes exactly one
      // identity-bearing part immediately before the suffix, which is right
      // for the common 2-3 level cases (acme.com, mail.acme.co.uk) but can
      // miss a genuine multi-part domain (school.district.k12.us) where the
      // identity spans more than one label. Checking the full raw domain as
      // well only ever ADDS accepted matches — it can't turn a real mismatch
      // into a false accept, since carriesBusinessIdentity still requires a
      // real word/acronym overlap with the business name.
      !carriesBusinessIdentity(domain, args.businessName)
    ) {
      // No website to check against (typical of AI-sourced contacts). The
      // domain must itself carry the business's name/acronym, or we cannot
      // tell it apart from a same-named organisation elsewhere in the world —
      // exactly how a Mumbai school got a US school's address.
      return {
        tier: "reject",
        reason: `Email domain (${emailLabel}) doesn't match "${args.businessName}" and there's no website to confirm it — can't verify it's the right organisation`,
      };
    }
  } else {
    // Freemail: the domain proves nothing, so the LOCAL part must carry the
    // business identity. Otherwise it's a private individual's inbox.
    if (!carriesBusinessIdentity(local, args.businessName)) {
      return {
        tier: "reject",
        reason: `Personal ${domain} inbox with no link to "${args.businessName}" — likely a private individual, not the business`,
      };
    }
  }

  // ---- Passed identity. Now rank contact quality. ----
  if (looksLikePersonName(local)) {
    return { tier: "person", reason: `Named contact at ${domain}` };
  }
  if (DECISION_MAKER_ROLE_LOCAL_PARTS.has(roleBase)) {
    return { tier: "decision_maker", reason: `Decision-maker mailbox (${roleBase}@)` };
  }
  if (GENERIC_ROLE_LOCAL_PARTS.has(roleBase)) {
    return { tier: "generic", reason: `Shared mailbox (${roleBase}@) — reaches the business but not a specific person` };
  }
  // Verified-identity address that matches no known role pattern (e.g.
  // bpmhighschoolkhar@gmail.com): real, but not a specific human.
  return { tier: "generic", reason: `Business mailbox at ${domain}` };
}

/** Rank for picking the best of several candidate addresses. */
export const CONTACT_TIER_RANK: Record<Exclude<ContactTier, "reject">, number> = {
  person: 3,
  decision_maker: 2,
  generic: 1,
};
