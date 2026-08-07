/**
 * Pattern-based classification run on an inbound Gmail thread message
 * BEFORE it's ever treated as a genuine lead reply — see
 * poll-automated-replies.ts, which checks these ahead of calling the (more
 * expensive, AI-backed) ReplyDrafter. Deliberately NOT AI-based: bounce and
 * auto-reply notifications follow decades-old, extremely standardized
 * sender/subject conventions (RFC 3464 delivery-status reports, and every
 * major mail client's auto-responder), so a cheap, free, zero-latency
 * pattern match is both more reliable and faster than asking a model to
 * guess.
 *
 * Precision matters more than recall on both of these: a false positive
 * here means a GENUINE reply from a real prospect silently never gets
 * drafted for human review — worse than the false-negative case (a bounce
 * or auto-reply slips through and gets treated as a real reply), which just
 * costs one wasted AI draft, exactly today's status quo. Patterns are
 * therefore narrow, anchored, and drawn only from conventions used
 * near-universally across mail providers — never loose keyword matching.
 */

/** Senders that generate delivery-failure notifications, not humans. */
const BOUNCE_FROM_PATTERNS = [
  /mailer-daemon/i,
  /postmaster/i,
  /mail delivery subsystem/i,
  /mail delivery system/i,
  /mail delivery service/i,
];

/** Subject lines used by the standard delivery-status-notification (RFC
 *  3464) implementations across Gmail, Outlook/Exchange, and generic MTAs.
 *  Anchored to the start of the subject — these are always machine-generated
 *  prefixes, never something a human types into a reply. */
const BOUNCE_SUBJECT_PATTERNS = [
  /^delivery status notification \(failure\)/i,
  /^undelivered mail returned to sender/i,
  /^mail delivery failed/i,
  /^failure notice/i,
  /^returned mail: see transcript for details/i,
  /^delivery has failed to these recipients/i,
  /^message delivery failure/i,
  /^delivery incomplete/i,
  /^undeliverable:/i,
];

/** Body phrases Gmail/Google Workspace use for a SENDER-side throttle notice
 *  — "you (the account) are rate-limited right now", not "this recipient's
 *  address is bad". These arrive from the same mailer-daemon address as a
 *  genuine bounce and were, before this check existed, misclassified as one:
 *  a real production incident where a Gmail account hit its daily send cap
 *  mid-campaign and 33 perfectly good leads (principal@vit.edu.in,
 *  contact@kohinoorcollege.com, ...) got permanently marked "bounced" and
 *  suppressed, though nothing was ever wrong with any of them — the account
 *  itself, not the recipients, was the problem. MUST be checked before
 *  `isBounceNotification`, which would otherwise match these first (both
 *  come from mailer-daemon). */
const SENDER_RATE_LIMIT_BODY_PATTERNS = [
  /reached a limit for sending mail/i,
  /exceeded (the )?(daily )?(sending|send) (quota|limit)/i,
  /your message was not sent/i,
  /rate.?limit(ed|ing)? (exceeded|reached)/i,
  /too many (login attempts|messages sent)/i,
];

/** True if this inbound message is the SENDING account being throttled by
 *  its own provider, not a real recipient-side bounce. See callers — this is
 *  NEVER terminal for the lead; it means "stop sending from this account
 *  right now", not "this address is bad". Checked on the message BODY, since
 *  the from-address/subject alone can't be distinguished from a genuine
 *  bounce (both come from mailer-daemon@...). */
export function isSenderRateLimited(args: { from: string; body: string }): boolean {
  if (!BOUNCE_FROM_PATTERNS.some((p) => p.test(args.from ?? ""))) return false;
  const body = args.body ?? "";
  return SENDER_RATE_LIMIT_BODY_PATTERNS.some((p) => p.test(body));
}

/** True if this inbound message is a delivery-failure (bounce) notification,
 *  not a reply from the lead. Checked on BOTH signals — either alone is
 *  already a strong, standardized indicator; matching either is enough.
 *  Callers MUST check `isSenderRateLimited` first — see its doc comment. */
export function isBounceNotification(args: { from: string; subject: string }): boolean {
  const from = args.from ?? "";
  const subject = (args.subject ?? "").trim();
  return (
    BOUNCE_FROM_PATTERNS.some((p) => p.test(from)) ||
    BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(subject))
  );
}

/** Subject prefixes used by the standard out-of-office/vacation-responder
 *  feature in Gmail, Outlook, and Apple Mail — always machine-generated,
 *  always at the start of the subject. */
const AUTO_REPLY_SUBJECT_PATTERNS = [
  /^out of office/i,
  /^automatic reply/i,
  /^auto-?reply/i,
  /^automatic response/i,
  /^away from (my|the) (desk|office)/i,
  /^vacation (reply|response|auto-?responder)/i,
];

/** True if this inbound message is an out-of-office/vacation auto-responder
 *  rather than a genuine reply. Unlike a bounce, this is NOT terminal for
 *  the lead — no status change, no cancelled follow-ups — it just means
 *  "don't draft a reply to this one," since the sequence should still run
 *  its course once the person is back. See poll-automated-replies.ts. */
export function isAutoReply(args: { subject: string }): boolean {
  return AUTO_REPLY_SUBJECT_PATTERNS.some((p) => p.test((args.subject ?? "").trim()));
}
