import type {
  WhatsAppSender,
  WhatsAppSenderCredentials,
  WhatsAppTemplateSendArgs,
} from "@/server/ports";

/** Captures WhatsApp template sends in memory so tests can assert on them.
 *  Nothing leaves the process — dev/test never messages real leads. */
export class MockWhatsAppSender implements WhatsAppSender {
  readonly sent: {
    creds: WhatsAppSenderCredentials;
    message: WhatsAppTemplateSendArgs;
  }[] = [];
  private counter = 0;

  async send(
    creds: WhatsAppSenderCredentials,
    message: WhatsAppTemplateSendArgs,
  ): Promise<{ providerMessageId: string }> {
    this.sent.push({ creds, message });
    this.counter += 1;
    return { providerMessageId: `mock-wamid.${this.counter}` };
  }
}
