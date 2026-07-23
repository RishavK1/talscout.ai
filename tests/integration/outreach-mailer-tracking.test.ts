import { describe, expect, it } from "vitest";
import { buildRawMessage } from "../../src/server/adapters/outreach.mailer";
import { buildTrackedHtmlBody, buildOpenTrackingUrl, TRANSPARENT_GIF } from "../../src/server/lib/tracking-pixel";
import type { OutreachSendArgs } from "../../src/server/ports";

const BASE_MESSAGE: OutreachSendArgs = {
  from: "sender@test.local",
  to: "lead@test.local",
  subject: "Quick question",
  text: "Hi there,\n\nJust checking in.\n\nBest,\nJane",
  messageId: "<abc-123@test.local>",
};

function decodeRawMessage(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

describe("buildRawMessage (Gmail raw MIME)", () => {
  it("stays plain-text-only when no trackingPixelUrl is set — unchanged from before pixel support existed", () => {
    const decoded = decodeRawMessage(buildRawMessage(BASE_MESSAGE));
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).not.toContain("multipart/alternative");
    expect(decoded).toContain("Just checking in.");
  });

  it("builds a real multipart/alternative message with both text and HTML parts when trackingPixelUrl is set", () => {
    const pixelUrl = "https://app.test.local/api/track/open/bf/send-1";
    const decoded = decodeRawMessage(
      buildRawMessage({ ...BASE_MESSAGE, trackingPixelUrl: pixelUrl }),
    );
    expect(decoded).toContain("Content-Type: multipart/alternative; boundary=");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain('Content-Type: text/html; charset="UTF-8"');
    // The plain-text part is untouched — same body a mail client without
    // HTML rendering (or a reply-quote) would show.
    expect(decoded).toContain("Just checking in.");
    // The HTML part carries the invisible pixel and the same content.
    expect(decoded).toContain(`<img src="${pixelUrl}"`);
    expect(decoded).toContain("Just checking in.");
    // Boundary actually delimits two parts (opens + closes correctly).
    const boundaryMatch = decoded.match(/boundary="([^"]+)"/);
    expect(boundaryMatch).not.toBeNull();
    const boundary = boundaryMatch![1];
    expect(decoded.split(`--${boundary}`).length).toBeGreaterThanOrEqual(3); // 2 parts + closing
    expect(decoded).toContain(`--${boundary}--`);
  });
});

describe("buildTrackedHtmlBody", () => {
  it("escapes HTML-significant characters from the plain-text body", () => {
    const html = buildTrackedHtmlBody("Are 1 < 2 && 3 > 2?", "https://x.test/p");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).not.toContain("1 < 2");
  });

  it("embeds the pixel as an invisible 1x1 image", () => {
    const html = buildTrackedHtmlBody("hello", "https://x.test/p/abc");
    expect(html).toContain('src="https://x.test/p/abc"');
    expect(html).toContain('width="1" height="1"');
    expect(html).toContain("display:none");
  });
});

describe("buildOpenTrackingUrl", () => {
  it("builds an absolute URL under /api/track/open/<kind>/<id>", () => {
    const url = buildOpenTrackingUrl("bf", "send-123");
    expect(url).toMatch(/\/api\/track\/open\/bf\/send-123$/);
    expect(url.startsWith("http")).toBe(true);
  });
});

describe("TRANSPARENT_GIF", () => {
  it("is a valid, non-empty GIF byte buffer", () => {
    expect(TRANSPARENT_GIF.length).toBeGreaterThan(0);
    // GIF magic bytes: "GIF87a" or "GIF89a"
    expect(TRANSPARENT_GIF.subarray(0, 3).toString("ascii")).toBe("GIF");
  });
});
