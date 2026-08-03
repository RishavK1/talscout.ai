import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveTxt = vi.fn();
vi.mock("node:dns/promises", () => ({
  resolveTxt: (...args: unknown[]) => resolveTxt(...args),
}));

const { checkDomainDeliverability } = await import("../../src/server/lib/dns-health");

function notFound(): NodeJS.ErrnoException {
  const err = new Error("queryTxt ENOTFOUND") as NodeJS.ErrnoException;
  err.code = "ENOTFOUND";
  return err;
}

beforeEach(() => {
  resolveTxt.mockReset();
});

describe("checkDomainDeliverability", () => {
  it("consumer webmail domains (gmail.com etc.) are never DNS-checked — the provider owns that DNS, not the user", async () => {
    const report = await checkDomainDeliverability("gmail.com");
    expect(report.isConsumerProvider).toBe(true);
    expect(report.spf).toBeUndefined();
    expect(resolveTxt).not.toHaveBeenCalled();
  });

  it("finds a present SPF record", async () => {
    resolveTxt.mockImplementation(async (host: string) => {
      if (host === "example.com") return [["v=spf1 include:_spf.google.com ~all"]];
      throw notFound();
    });
    const report = await checkDomainDeliverability("example.com");
    expect(report.spf?.status).toBe("present");
    expect(report.spf?.record).toContain("v=spf1");
  });

  it("reports SPF missing when the TXT record set has no v=spf1 entry", async () => {
    resolveTxt.mockImplementation(async (host: string) => {
      if (host === "example.com") return [["some-other-verification-txt=abc123"]];
      throw notFound();
    });
    const report = await checkDomainDeliverability("example.com");
    expect(report.spf?.status).toBe("missing");
  });

  it("reports SPF missing (not unknown) on a definitive ENOTFOUND", async () => {
    resolveTxt.mockRejectedValue(notFound());
    const report = await checkDomainDeliverability("example.com");
    expect(report.spf?.status).toBe("missing");
    expect(report.dmarc?.status).toBe("missing");
  });

  it("fails OPEN to 'unknown' (never 'missing') on an ambiguous DNS error", async () => {
    resolveTxt.mockImplementation(async () => {
      const err = new Error("timeout") as NodeJS.ErrnoException;
      err.code = "ETIMEOUT";
      throw err;
    });
    const report = await checkDomainDeliverability("example.com");
    expect(report.spf?.status).toBe("unknown");
    expect(report.dmarc?.status).toBe("unknown");
    expect(report.dkim?.status).toBe("unknown");
  });

  it("finds DMARC at the _dmarc subdomain specifically", async () => {
    resolveTxt.mockImplementation(async (host: string) => {
      if (host === "_dmarc.example.com") return [["v=DMARC1; p=reject;"]];
      throw notFound();
    });
    const report = await checkDomainDeliverability("example.com");
    expect(report.dmarc?.status).toBe("present");
    expect(report.dmarc?.record).toContain("DMARC1");
  });

  it("finds DKIM at a common selector and reports which one", async () => {
    resolveTxt.mockImplementation(async (host: string) => {
      if (host === "selector2._domainkey.example.com") return [["v=DKIM1; k=rsa; p=abc"]];
      throw notFound();
    });
    const report = await checkDomainDeliverability("example.com");
    expect(report.dkim?.status).toBe("present");
    expect(report.dkim?.selector).toBe("selector2");
  });

  it("reports DKIM missing when none of the common selectors resolve", async () => {
    resolveTxt.mockRejectedValue(notFound());
    const report = await checkDomainDeliverability("example.com");
    expect(report.dkim?.status).toBe("missing");
  });

  it("normalizes domain casing before checking the consumer-provider list", async () => {
    const report = await checkDomainDeliverability("Gmail.COM");
    expect(report.isConsumerProvider).toBe(true);
  });
});
