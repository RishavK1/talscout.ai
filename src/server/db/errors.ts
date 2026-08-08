/** Detects a Postgres unique-constraint violation (code 23505), including
 *  through driver wrapper layers that nest the real error under `.cause`.
 *  Same check as auth.service.ts's local isUniqueViolation — pulled out
 *  here so new callers (agent-skill.repo.ts) don't duplicate it. */
export function isUniqueViolation(e: unknown): boolean {
  if (typeof e === "object" && e !== null) {
    if ("code" in e && (e as { code: string }).code === "23505") {
      return true;
    }
    if ("cause" in e) {
      return isUniqueViolation((e as { cause: unknown }).cause);
    }
  }
  return false;
}
