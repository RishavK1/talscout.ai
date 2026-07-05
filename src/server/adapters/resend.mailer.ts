import { getEnv } from "@/server/config/env";
import type { Mailer, MailMessage } from "@/server/ports";

/**
 * Real transactional email via Resend (plain REST — no SDK needed). The `from`
 * address must belong to a domain verified in the Resend dashboard; until one
 * is verified, Resend's shared onboarding sender (the default) only delivers
 * to the account owner's own inbox — set RESEND_FROM once the domain is live.
 */
export class ResendMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    const env = getEnv();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend send failed: ${res.status} ${detail.slice(0, 300)}`);
    }
  }
}
