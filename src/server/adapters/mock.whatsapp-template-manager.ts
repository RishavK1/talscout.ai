import type {
  WhatsAppTemplateManager,
  WhatsAppTemplateStatusResult,
  WhatsAppTemplateSubmission,
} from "@/server/ports";

/** Auto-"approves" every submitted template so dev/test can exercise the
 *  full send path without a real Meta review cycle. Nothing leaves the
 *  process — dev/test never talks to Meta. */
export class MockWhatsAppTemplateManager implements WhatsAppTemplateManager {
  private counter = 0;

  async submit(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _input: WhatsAppTemplateSubmission,
  ): Promise<{ metaTemplateId: string }> {
    this.counter += 1;
    return { metaTemplateId: `mock-template-${this.counter}` };
  }

  async getStatus(
    _wabaId: string,
    _accessToken: string,
    _metaTemplateId: string,
  ): Promise<WhatsAppTemplateStatusResult> {
    return { metaTemplateId: _metaTemplateId, status: "approved" };
  }
}
