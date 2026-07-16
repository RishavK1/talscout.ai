import nodemailer from "nodemailer";
import { google } from "googleapis";
import { getEnv } from "@/server/config/env";
import type {
  OutreachMailer,
  OutreachSendArgs,
  OutreachSendResult,
  SenderAccountCredentials,
} from "@/server/ports";

/**
 * Real bulk-fire sending. SMTP accounts go through nodemailer directly.
 * Gmail accounts go through the Gmail API using an access token refreshed
 * from the stored refresh token — server-side OAuth with offline access, so
 * sending works with no browser tab open (unlike the original CRM's
 * browser-implicit-token flow). Plain-text only, no tracking pixel or
 * List-Unsubscribe header — deliverability here comes from spintax variation
 * and paced scheduling (server/lib/spintax.ts), not from headers.
 *
 * Threading: every send stamps the caller-generated `Message-ID`, and
 * follow-up sends carry `In-Reply-To`/`References` (all clients) plus
 * Gmail's `threadId` (Gmail's authoritative same-thread mechanism) so Day 3/
 * Day 7 land as replies in the Day 0 conversation, never as a new mail.
 */
export class OutreachMailerAdapter implements OutreachMailer {
  async send(
    creds: SenderAccountCredentials,
    message: OutreachSendArgs,
  ): Promise<OutreachSendResult> {
    if (creds.type === "smtp") {
      return await sendSmtp(creds, message);
    }
    return await sendGmail(creds, message);
  }

  async threadHasReply(
    creds: SenderAccountCredentials,
    args: { gmailThreadId: string; senderEmail: string },
  ): Promise<"replied" | "no_reply" | "unknown"> {
    // SMTP has no server-side thread to inspect; send-only Gmail tokens
    // would just get a 403 — both are "can't know", which callers treat as
    // "send anyway" (see the port's doc comment).
    if (creds.type !== "gmail" || !creds.hasReadScope) return "unknown";
    try {
      const gmail = gmailClient(creds.refreshToken);
      const { data } = await gmail.users.threads.get({
        userId: "me",
        id: args.gmailThreadId,
        format: "metadata",
        metadataHeaders: ["From"],
      });
      const sender = args.senderEmail.toLowerCase();
      const replied = (data.messages ?? []).some((m) => {
        const from = m.payload?.headers?.find(
          (h) => h.name?.toLowerCase() === "from",
        )?.value;
        return typeof from === "string" && !from.toLowerCase().includes(sender);
      });
      return replied ? "replied" : "no_reply";
    } catch {
      return "unknown";
    }
  }
}

async function sendSmtp(
  creds: Extract<SenderAccountCredentials, { type: "smtp" }>,
  message: OutreachSendArgs,
): Promise<OutreachSendResult> {
  const transport = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.username, pass: creds.password },
  });
  await transport.sendMail({
    from: message.fromName ? `"${message.fromName}" <${message.from}>` : message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    replyTo: message.replyTo,
    messageId: message.messageId,
    inReplyTo: message.inReplyTo,
    references: message.inReplyTo,
  });
  return {};
}

function gmailClient(refreshToken: string) {
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET are not configured");
  }
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

async function sendGmail(
  creds: Extract<SenderAccountCredentials, { type: "gmail" }>,
  message: OutreachSendArgs,
): Promise<OutreachSendResult> {
  const gmail = gmailClient(creds.refreshToken);
  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildRawMessage(message),
      // Follow-ups name the Day 0 thread explicitly — with the In-Reply-To/
      // References headers below also matching, Gmail files this send into
      // that conversation rather than starting a new one.
      ...(message.gmailThreadId ? { threadId: message.gmailThreadId } : {}),
    },
  });
  return { gmailThreadId: data.threadId ?? undefined };
}

/** RFC 2822 message, base64url-encoded, as the Gmail API's `raw` field wants. */
function buildRawMessage(message: OutreachSendArgs): string {
  const from = message.fromName ? `"${message.fromName}" <${message.from}>` : message.from;
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeSubject(message.subject)}`,
    `Message-ID: ${message.messageId}`,
    message.inReplyTo ? `In-Reply-To: ${message.inReplyTo}` : null,
    message.inReplyTo ? `References: ${message.inReplyTo}` : null,
    message.replyTo ? `Reply-To: ${message.replyTo}` : null,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].filter((h): h is string => h !== null);
  const raw = `${headers.join("\r\n")}\r\n\r\n${message.text}`;
  return Buffer.from(raw).toString("base64url");
}

/** RFC 2047 encoded-word for non-ASCII subjects; plain ASCII passes through untouched. */
function encodeSubject(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}
