import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveMx = vi.fn();
const resolve4 = vi.fn();
const resolve6 = vi.fn();
vi.mock("node:dns/promises", () => ({
  resolveMx: (...args: unknown[]) => resolveMx(...args),
  resolve4: (...args: unknown[]) => resolve4(...args),
  resolve6: (...args: unknown[]) => resolve6(...args),
}));

// Imported AFTER the mock so the module under test picks up the mocked dns.
const { hasValidMx } = await import("../../src/server/lib/email-verification");

function notFound(): NodeJS.ErrnoException {
  const err = new Error("queryMx ENOTFOUND") as NodeJS.ErrnoException;
  err.code = "ENOTFOUND";
  return err;
}

beforeEach(() => {
  resolveMx.mockReset();
  resolve4.mockReset();
  resolve6.mockReset();
});

describe("hasValidMx", () => {
  it("valid when the domain has MX records", async () => {
    resolveMx.mockResolvedValueOnce([{ exchange: "mail.example.com", priority: 10 }]);
    expect(await hasValidMx(`someone@valid-mx-${Date.now()}.example`)).toBe(true);
    expect(resolve4).not.toHaveBeenCalled(); // MX found — never needed the fallback
  });

  it("valid via the RFC 5321 implicit-MX fallback when there's no MX but an A record exists", async () => {
    resolveMx.mockRejectedValueOnce(notFound());
    resolve4.mockResolvedValueOnce(["93.184.216.34"]);
    expect(await hasValidMx(`someone@a-record-only-${Date.now()}.example`)).toBe(true);
  });

  it("invalid only when MX, A, and AAAA all definitively resolve to nothing", async () => {
    resolveMx.mockRejectedValueOnce(notFound());
    resolve4.mockRejectedValueOnce(notFound());
    resolve6.mockRejectedValueOnce(notFound());
    expect(await hasValidMx(`someone@totally-fake-domain-${Date.now()}.invalid`)).toBe(false);
  });

  it("fails OPEN on a transient/ambiguous DNS error — never blocks a lead over a network blip", async () => {
    const timeout = new Error("timeout") as NodeJS.ErrnoException;
    timeout.code = "ETIMEOUT";
    resolveMx.mockRejectedValueOnce(timeout);
    // Fallbacks must not even be needed — an ambiguous MX result short-circuits open.
    expect(await hasValidMx(`someone@ambiguous-${Date.now()}.example`)).toBe(true);
    expect(resolve4).not.toHaveBeenCalled();
  });

  it("fails OPEN when MX has no records but the A-record check is itself ambiguous", async () => {
    resolveMx.mockRejectedValueOnce(notFound());
    const refused = new Error("connection refused") as NodeJS.ErrnoException;
    refused.code = "ECONNREFUSED";
    resolve4.mockRejectedValueOnce(refused);
    expect(await hasValidMx(`someone@ambiguous-a-${Date.now()}.example`)).toBe(true);
  });

  it("invalid for a malformed address with no domain at all — never calls DNS", async () => {
    expect(await hasValidMx("not-an-email")).toBe(false);
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it("caches per-domain — a second lookup for the same domain doesn't hit DNS again", async () => {
    const domain = `cache-test-${Date.now()}.example`;
    resolveMx.mockResolvedValueOnce([{ exchange: "mail.example.com", priority: 10 }]);
    expect(await hasValidMx(`first@${domain}`)).toBe(true);
    expect(await hasValidMx(`second@${domain}`)).toBe(true);
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });
});
