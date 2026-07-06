import nodemailer from "nodemailer";
import { google } from "googleapis";
import { getEnv } from "@/server/config/env";
import type { OutreachMailer, OutreachSendArgs, SenderAccountCredentials } from "@/server/ports";

/**
 * Real bulk-fire sending. SMTP accounts go through nodemailer directly.
 * Gmail accounts go through the Gmail API using an access token refreshed
 * from the stored refresh token — server-side OAuth with offline access, so
 * sending works with no browser tab open (unlike the original CRM's
 * browser-implicit-token flow). Plain-text only, no tracking pixel or
 * List-Unsubscribe header — deliverability here comes from spintax variation
 * and paced scheduling (server/lib/spintax.ts), not from headers.
 */
export class OutreachMailerAdapter implements OutreachMailer {
  async send(creds: SenderAccountCredentials, message: OutreachSendArgs): Promise<void> {
    if (creds.type === "smtp") {
      await sendSmtp(creds, message);
    } else {
      await sendGmail(creds, message);
    }
  }
}

async function sendSmtp(
  creds: Extract<SenderAccountCredentials, { type: "smtp" }>,
  message: OutreachSendArgs,
): Promise<void> {
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
  });
}

async function sendGmail(
  creds: Extract<SenderAccountCredentials, { type: "gmail" }>,
  message: OutreachSendArgs,
): Promise<void> {
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET are not configured");
  }
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: creds.refreshToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: buildRawMessage(message) },
  });
}

/** RFC 2822 message, base64url-encoded, as the Gmail API's `raw` field wants. */
function buildRawMessage(message: OutreachSendArgs): string {
  const from = message.fromName ? `"${message.fromName}" <${message.from}>` : message.from;
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeSubject(message.subject)}`,
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
