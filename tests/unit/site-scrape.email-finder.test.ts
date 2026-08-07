import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { SiteScrapeEmailFinder } = await import("@/server/adapters/site-scrape.email-finder");

const WEBSITE = "https://acmedental.com";
const BUSINESS_NAME = "Acme Dental";

function htmlResponse(html: string) {
  return { ok: true, text: async () => html };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("SiteScrapeEmailFinder — team/leadership page + tiered candidate selection", () => {
  it("prefers a named person found on the team page over a generic homepage inbox", async () => {
    fetchMock
      // homepage: generic inbox + a link to the team page
      .mockResolvedValueOnce(
        htmlResponse(
          `<a href="mailto:info@acmedental.com">Email us</a><a href="/team">Our Team</a>`,
        ),
      )
      // team page: a named dentist's own email
      .mockResolvedValueOnce(htmlResponse(`<a href="mailto:jane.doe@acmedental.com">Dr. Jane Doe</a>`));

    const finder = new SiteScrapeEmailFinder();
    const result = await finder.find({ website: WEBSITE, businessName: BUSINESS_NAME });
    expect(result?.email).toBe("jane.doe@acmedental.com");
  });

  it("falls back to the homepage's generic address when no team/contact page has anything better", async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(`<a href="mailto:info@acmedental.com">Email us</a>`),
    );
    const finder = new SiteScrapeEmailFinder();
    const result = await finder.find({ website: WEBSITE, businessName: BUSINESS_NAME });
    expect(result?.email).toBe("info@acmedental.com");
  });

  it("checks BOTH a team page and a contact page when both are linked", async () => {
    fetchMock
      .mockResolvedValueOnce(
        htmlResponse(
          `<a href="/team">Team</a><a href="/contact">Contact</a>`,
        ),
      )
      .mockResolvedValueOnce(htmlResponse(`<p>no email here</p>`)) // team page: nothing
      .mockResolvedValueOnce(htmlResponse(`<a href="mailto:owner@acmedental.com">Owner</a>`)); // contact page

    const finder = new SiteScrapeEmailFinder();
    const result = await finder.find({ website: WEBSITE, businessName: BUSINESS_NAME });
    expect(result?.email).toBe("owner@acmedental.com");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a candidate that doesn't belong to this business (e.g. a web agency's footer email)", async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(`<a href="mailto:contact@some-web-agency.org">Site by Some Agency</a>`),
    );
    const finder = new SiteScrapeEmailFinder();
    const result = await finder.find({ website: WEBSITE, businessName: BUSINESS_NAME });
    expect(result).toBeNull();
  });

  it("returns null when the homepage has no usable candidate and there's nothing else to check", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(`<p>No contact info here.</p>`));
    const finder = new SiteScrapeEmailFinder();
    const result = await finder.find({ website: WEBSITE, businessName: BUSINESS_NAME });
    expect(result).toBeNull();
  });

  it("returns null without fetching anything when no website is given", async () => {
    const finder = new SiteScrapeEmailFinder();
    const result = await finder.find({ businessName: BUSINESS_NAME });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
