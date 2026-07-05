import type { Mailer, MailMessage } from "@/server/ports";

/** Captures sent mail in memory so tests can assert on it. Nothing leaves the
 *  process — dev/test never emails real candidates. */
export class MockMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}
