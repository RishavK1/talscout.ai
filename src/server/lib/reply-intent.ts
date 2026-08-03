import type { ReplyDraftResult } from "@/server/ports";

const VALID_INTENTS = new Set<NonNullable<ReplyDraftResult["intent"]>>([
  "interested",
  "not_interested",
  "referral",
  "unclear",
]);

/** Defensive normalization for the AI-drafted `intent` field — same
 *  discipline as normalizeLeadQualification: the enum is described in
 *  prose to the model (Gemini/OpenRouter), not schema-enforced at the
 *  provider level, so a malformed or unexpected value must never reach the
 *  database's real pg enum column (automated_reply_intent), where it would
 *  throw and fail the whole poll batch. Anything not exactly one of the
 *  four known values degrades to "unclear" — the honest "couldn't tell"
 *  value, never silently dropped. */
export function normalizeReplyIntent(value: unknown): ReplyDraftResult["intent"] {
  if (typeof value === "string" && (VALID_INTENTS as Set<string>).has(value)) {
    return value as ReplyDraftResult["intent"];
  }
  return "unclear";
}
