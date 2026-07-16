import type {
  WhatsAppSender,
  WhatsAppSenderCredentials,
  WhatsAppTemplateSendArgs,
} from "@/server/ports";

const GRAPH_API_VERSION = "v21.0";

/**
 * Real WhatsApp Business Cloud API sending — direct Meta integration (no
 * BSP/no-code layer). Every send is a pre-approved template message; Meta
 * rejects free-form business-initiated text outright, so there is no
 * plain-text path here the way there is for email.
 */
export class WhatsAppSenderAdapter implements WhatsAppSender {
  async send(
    creds: WhatsAppSenderCredentials,
    message: WhatsAppTemplateSendArgs,
  ): Promise<{ providerMessageId: string }> {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "template",
          template: {
            name: message.templateName,
            language: { code: message.language },
            components:
              message.bodyParams.length > 0
                ? [
                    {
                      type: "body",
                      parameters: message.bodyParams.map((text) => ({
                        type: "text",
                        text,
                      })),
                    },
                  ]
                : [],
          },
        }),
      },
    );

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(
        body?.error?.message || `WhatsApp send failed with status ${res.status}`,
      ) as Error & { code?: number; status?: number };
      err.code = body?.error?.code;
      err.status = res.status;
      throw err;
    }

    const providerMessageId: string | undefined = body?.messages?.[0]?.id;
    if (!providerMessageId) {
      throw new Error("WhatsApp send succeeded but returned no message id");
    }
    return { providerMessageId };
  }
}
