import nodemailer from "nodemailer";
import { google, type gmail_v1 } from "googleapis";
import { getEnv } from "@/server/config/env";
import { buildTrackedHtmlBody } from "@/server/lib/tracking-pixel";
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
 * browser-implicit-token flow). Plain text by default; when the caller sets
 * `trackingPixelUrl`, an HTML alternative part carrying the pixel is added
 * alongside it (never replacing the plain-text part) — deliverability still
 * leans on spintax variation and paced scheduling (server/lib/spintax.ts),
 * not on headers, so the HTML part stays as close to the plain text as
 * possible (no styling, no tracked links, one invisible 1x1 image).
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

  async getThreadReplyContent(
    creds: SenderAccountCredentials,
    args: { gmailThreadId: string; senderEmail: string },
  ): Promise<{ subject: string; body: string } | null> {
    // Same fail-quiet posture as threadHasReply above — SMTP/no-read-scope
    // tokens simply have nothing to fetch, any transient API error means
    // "nothing to draft yet," never a thrown failure.
    if (creds.type !== "gmail" || !creds.hasReadScope) return null;
    try {
      const gmail = gmailClient(creds.refreshToken);
      const { data } = await gmail.users.threads.get({
        userId: "me",
        id: args.gmailThreadId,
        format: "full",
      });
      const sender = args.senderEmail.toLowerCase();
      const messages = data.messages ?? [];
      // Latest message not from us — mirrors threadHasReply's "From doesn't
      // include senderEmail" check, walked from the end so a multi-reply
      // thread yields the newest inbound message, not the oldest.
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const headers = m.payload?.headers ?? [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value;
        if (!from || from.toLowerCase().includes(sender)) continue;
        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
        const body = extractPlainTextBody(m.payload);
        if (!body) continue;
        return { subject, body };
      }
      return null;
    } catch {
      return null;
    }
  }
}

/** Walks a Gmail message payload (recursively, for multipart messages)
 *  preferring text/plain; falls back to text/html stripped to text. Returns
 *  "" if no readable body part is found. */
function extractPlainTextBody(
  payload: gmail_v1.Schema$MessagePart | null | undefined,
): string {
  if (!payload) return "";
  const plain = findPart(payload, "text/plain");
  if (plain) return decodeBase64Url(plain);
  const html = findPart(payload, "text/html");
  if (html) return htmlToText(decodeBase64Url(html));
  return "";
}

function findPart(
  payload: gmail_v1.Schema$MessagePart,
  mimeType: string,
): string | null {
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data;
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
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
    // nodemailer builds a proper multipart/alternative message once both
    // `text` and `html` are set; omitting `html` (the common case) sends
    // plain-text-only exactly as before this field existed.
    ...(message.trackingPixelUrl
      ? { html: buildTrackedHtmlBody(message.text, message.trackingPixelUrl) }
      : {}),
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

/** RFC 2822 message, base64url-encoded, as the Gmail API's `raw` field wants.
 *  Plain text only unless `trackingPixelUrl` is set, in which case this
 *  builds a real multipart/alternative body (text/plain + text/html) instead
 *  — Gmail (and every other client) then picks whichever part it renders,
 *  same message either way. */
/** Exported for direct unit testing of the MIME construction (base64url
 *  decode + assert headers/boundary/parts) — the real send path never needs
 *  this exported, only tests do. */
export function buildRawMessage(message: OutreachSendArgs): string {
  const from = message.fromName ? `"${message.fromName}" <${message.from}>` : message.from;
  const sharedHeaders = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeSubject(message.subject)}`,
    `Message-ID: ${message.messageId}`,
    message.inReplyTo ? `In-Reply-To: ${message.inReplyTo}` : null,
    message.inReplyTo ? `References: ${message.inReplyTo}` : null,
    message.replyTo ? `Reply-To: ${message.replyTo}` : null,
    "MIME-Version: 1.0",
  ].filter((h): h is string => h !== null);

  if (!message.trackingPixelUrl) {
    const headers = [
      ...sharedHeaders,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
    ];
    const raw = `${headers.join("\r\n")}\r\n\r\n${message.text}`;
    return Buffer.from(raw).toString("base64url");
  }

  const boundary = `----=_Part_${message.messageId.replace(/[<>]/g, "").replace(/[^a-zA-Z0-9]/g, "")}`;
  const html = buildTrackedHtmlBody(message.text, message.trackingPixelUrl);
  const headers = [...sharedHeaders, `Content-Type: multipart/alternative; boundary="${boundary}"`];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    message.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");
  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(raw).toString("base64url");
}

/** RFC 2047 encoded-word for non-ASCII subjects; plain ASCII passes through untouched. */
function encodeSubject(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}
