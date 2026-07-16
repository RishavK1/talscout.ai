import type {
  WhatsAppTemplateManager,
  WhatsAppTemplateStatusResult,
  WhatsAppTemplateSubmission,
} from "@/server/ports";

const GRAPH_API_VERSION = "v21.0";

/** Real Meta Graph API template submission/status lookup — direct
 *  integration, no BSP layer, mirroring `WhatsAppSenderAdapter`. */
export class WhatsAppTemplateManagerAdapter implements WhatsAppTemplateManager {
  async submit(
    input: WhatsAppTemplateSubmission,
  ): Promise<{ metaTemplateId: string }> {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${input.wabaId}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: input.name,
          category: input.category.toUpperCase(),
          language: input.language,
          components: [{ type: "BODY", text: input.bodyText }],
        }),
      },
    );

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        body?.error?.message || `WhatsApp template submit failed with status ${res.status}`,
      );
    }
    const metaTemplateId: string | undefined = body?.id;
    if (!metaTemplateId) {
      throw new Error("WhatsApp template submission succeeded but returned no id");
    }
    return { metaTemplateId };
  }

  async getStatus(
    wabaId: string,
    accessToken: string,
    metaTemplateId: string,
  ): Promise<WhatsAppTemplateStatusResult> {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(metaTemplateId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        body?.error?.message || `WhatsApp template status lookup failed with status ${res.status}`,
      );
    }
    const match = (body?.data ?? []).find(
      (t: { id?: string }) => t.id === metaTemplateId,
    );
    if (!match) {
      throw new Error("Template not found on Meta");
    }
    const status = String(match.status || "").toLowerCase();
    return {
      metaTemplateId,
      status:
        status === "approved" || status === "rejected" || status === "disabled"
          ? status
          : "pending",
      rejectionReason: match.rejected_reason ?? undefined,
    };
  }
}
