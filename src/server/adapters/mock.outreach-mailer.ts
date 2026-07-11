import type { OutreachMailer, OutreachSendArgs, SenderAccountCredentials } from "@/server/ports";

/** Captures bulk-fire sends in memory so tests can assert on them. Nothing
 *  leaves the process — dev/test never emails real leads. */
export class MockOutreachMailer implements OutreachMailer {
  readonly sent: { creds: SenderAccountCredentials; message: OutreachSendArgs }[] = [];

  async send(creds: SenderAccountCredentials, message: OutreachSendArgs): Promise<void> {
    this.sent.push({ creds, message });
  }
}
