import { decryptSecret } from "@/server/lib/secret-box";
import type { SenderAccountCredentials } from "@/server/ports";
import type { senderAccounts } from "@/server/db/schema";

/**
 * Shared by the automated-outreach service and both of its background jobs
 * (run-automated-campaign.ts, send-automated-email.ts). Deliberately its own
 * module, not a re-export of send-outreach-email.ts's private copy — this
 * feature must never import from a bulk-fire-owned job file.
 */

export function toCredentials(sender: typeof senderAccounts.$inferSelect): SenderAccountCredentials {
  if (sender.type === "gmail") {
    if (!sender.gmailRefreshTokenEnc) throw new Error("gmail_account_missing_refresh_token");
    return {
      type: "gmail",
      refreshToken: decryptSecret(sender.gmailRefreshTokenEnc),
      hasReadScope: sender.gmailHasReadScope,
    };
  }
  if (!sender.smtpHost || !sender.smtpPort || !sender.smtpUsername || !sender.smtpPasswordEnc) {
    throw new Error("smtp_account_missing_credentials");
  }
  return {
    type: "smtp",
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure ?? true,
    username: sender.smtpUsername,
    password: decryptSecret(sender.smtpPasswordEnc),
  };
}

export function generateMessageId(senderEmail: string): string {
  const domain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "talscout.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}
