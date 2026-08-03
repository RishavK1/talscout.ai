import type { EmailVerifier } from "@/server/ports";

/** Deterministic mock for APP_MODE=mock + tests — no DNS, no network.
 *  Everything is deliverable by default (matches every other mock adapter's
 *  "the happy path needs zero configuration" convention — the fake
 *  `*.example.com` addresses MockEmailFinder/MockLeadDiscovery generate
 *  would otherwise fail a REAL DNS check, which isn't what most pipeline
 *  tests are exercising). Test sentinel `%%INVALIDMX%%` (case-insensitive,
 *  and matched loosely since it typically reaches here already slugified —
 *  e.g. embedded in a campaign's `category`, it flows through
 *  MockLeadDiscovery → MockEmailFinder's businessName-derived slug and
 *  lands in the email as `...invalidmx...`) simulates a domain with no MX/
 *  A/AAAA records, for tests that specifically exercise the MX-check gate. */
export class MockEmailVerifier implements EmailVerifier {
  async isDeliverable(email: string): Promise<boolean> {
    return !email.toLowerCase().includes("invalidmx");
  }
}
