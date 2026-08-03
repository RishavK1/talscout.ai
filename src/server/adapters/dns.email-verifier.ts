import { hasValidMx } from "@/server/lib/email-verification";
import type { EmailVerifier } from "@/server/ports";

/** Thin port wrapper around the real DNS check — see
 *  lib/email-verification.ts for the actual MX/A/AAAA resolution logic and
 *  its fail-open discipline. Split into its own file (rather than having
 *  the lib function implement the port directly) purely so the lib stays a
 *  plain, port-agnostic utility other code could import directly if ever
 *  needed, mirroring how blueprint.service.ts's other lib/ helpers work. */
export class DnsEmailVerifier implements EmailVerifier {
  async isDeliverable(email: string): Promise<boolean> {
    return hasValidMx(email);
  }
}
