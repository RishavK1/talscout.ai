import { describe, expect, it } from "vitest";
import { assessContact, domainLabel, looksLikePersonName } from "@/server/lib/email-identity";

describe("assessContact — real production wrong-person incidents (must reject)", () => {
  it("rejects the web agency's address scraped off a client site's footer", () => {
    // Real incident: Somaiya Ayurvihar's site listed its web agency's own
    // contact address, which the site-scraper picked up as "the business's"
    // email.
    const result = assessContact({
      email: "contact@arigel.com",
      businessName: "Somaiya Ayurvihar",
      website: "https://www.somaiya-ayurvihar.org",
    });
    expect(result.tier).toBe("reject");
  });

  it("rejects an unfilled template placeholder that was marked ready to send", () => {
    const result = assessContact({
      email: "youremail@yourdomain.com",
      businessName: "Chetana College",
      website: "https://www.chetanacollege.in/",
    });
    expect(result.tier).toBe("reject");
  });

  it("rejects a same-named institution's address from the wrong country (AI cross-match)", () => {
    // Real incident: a Mumbai school got a US school's real address because
    // an AI search matched on the name alone with no way to confirm identity.
    const result = assessContact({
      email: "jmorales@sjcadets.org",
      businessName: "St. Josephs High School",
      website: null,
    });
    expect(result.tier).toBe("reject");
  });

  it("rejects a private individual's personal Gmail with no link to the organisation", () => {
    const result = assessContact({
      email: "devidasahire41@gmail.com",
      businessName: "N.M. Joshi Marg Municipal Secondary School",
      website: null,
    });
    expect(result.tier).toBe("reject");
  });
});

describe("assessContact — real production correct leads (must pass with the right tier)", () => {
  it("accepts a matching-domain generic mailbox", () => {
    const result = assessContact({
      email: "contact@kohinoorcollege.com",
      businessName: "Kohinoor College of Hospitality Management & Tourism Studies",
      website: "https://kohinoorcollege.com/",
    });
    expect(result.tier).toBe("generic");
  });

  it("accepts a decision-maker role mailbox on the business's own domain", () => {
    const result = assessContact({
      email: "admissions@somaiya.edu",
      businessName: "Somaiya Vidyavihar University",
      website: "https://www.somaiya.edu/en",
    });
    expect(result.tier).toBe("decision_maker");
  });

  it("accepts an acronym-domain match with no website to confirm against (AI-sourced)", () => {
    // "Vidyalankar Institute of Technology" -> vit.edu.in. This is the exact
    // shape that let a wrong-country match through before: it MUST only pass
    // because the acronym genuinely matches, not because AI confidence was high.
    const result = assessContact({
      email: "principal@vit.edu.in",
      businessName: "Vidyalankar Institute of Technology",
      website: null,
    });
    expect(result.tier).toBe("decision_maker");
  });

  it("accepts a role-department mailbox matched via a short identity token in the business name", () => {
    const result = assessContact({
      email: "modern.secondary.english@ies.edu",
      businessName: "IES Modern English School",
      website: null,
    });
    expect(result.tier).not.toBe("reject");
  });
});

describe("assessContact — genericity: not tuned to one campaign's category or country", () => {
  it("US dentist — generic mailbox on matching domain passes", () => {
    const result = assessContact({
      email: "hello@austinsmiledental.com",
      businessName: "Austin Smile Dental",
      website: "https://austinsmiledental.com",
    });
    expect(result.tier).toBe("generic");
  });

  it("UAE law firm — named partner on matching domain passes as 'person'", () => {
    const result = assessContact({
      email: "sarah.khan@dubaiprimelaw.ae",
      businessName: "Dubai Prime Law Associates",
      website: "https://dubaiprimelaw.ae",
    });
    expect(result.tier).toBe("person");
  });

  it("UK salon — owner@ on matching domain passes as decision_maker", () => {
    const result = assessContact({
      email: "owner@bellahairstudio.co.uk",
      businessName: "Bella Hair Studio",
      website: "https://www.bellahairstudio.co.uk",
    });
    expect(result.tier).toBe("decision_maker");
  });

  it("US auto shop — an address with zero relation to the business is rejected regardless of category", () => {
    const result = assessContact({
      email: "support@totallyunrelatedwidgets.com",
      businessName: "Riverside Auto Repair",
      website: "https://riversideautorepair.com",
    });
    expect(result.tier).toBe("reject");
  });

  it("India restaurant chain — shared corporate domain still matches via a real name token", () => {
    const result = assessContact({
      email: "info@dominos.com",
      businessName: "Domino's Pizza - MG Road",
      website: null,
    });
    expect(result.tier).not.toBe("reject");
  });

  it("Australian vet clinic — freemail inbox carrying the business name in the local part passes", () => {
    const result = assessContact({
      email: "sydneyvetclinic@gmail.com",
      businessName: "Sydney Vet Clinic",
      website: null,
    });
    expect(result.tier).not.toBe("reject");
  });

  it("Canadian accountant — freemail inbox with NO link to the business name is rejected", () => {
    const result = assessContact({
      email: "mjohnson88@gmail.com",
      businessName: "Toronto Tax & Accounting",
      website: null,
    });
    expect(result.tier).toBe("reject");
  });
});

describe("assessContact — vendor/template/placeholder domains", () => {
  it.each([
    ["info@example.com", "Any Business"],
    ["contact@test.com", "Any Business"],
    ["hello@wixsite.com", "Any Business"],
    ["admin@godaddysites.com", "Any Business"],
  ])("rejects %s as a non-business/vendor domain", (email, businessName) => {
    expect(assessContact({ email, businessName, website: null }).tier).toBe("reject");
  });

  it.each(["noreply@acme.com", "webmaster@acme.com", "postmaster@acme.com"])(
    "rejects the automated/non-decision-maker mailbox %s",
    (email) => {
      expect(assessContact({ email, businessName: "Acme Co", website: "https://acme.com" }).tier).toBe(
        "reject",
      );
    },
  );
});

describe("looksLikePersonName", () => {
  it.each(["jane.doe", "j.morales", "sarah-khan", "rkamboj"])("recognizes %s as a person", (local) => {
    expect(looksLikePersonName(local)).toBe(true);
  });

  it.each(["info", "contact", "admissions", "principal", "webmaster", "a", "team.sales.leads"])(
    "does not treat %s as a person",
    (local) => {
      expect(looksLikePersonName(local)).toBe(false);
    },
  );
});

describe("domainLabel", () => {
  it.each([
    ["acme.com", "acme"],
    ["www.acme.com", "acme"],
    ["mail.acme.co.uk", "acme"],
    ["somaiya.edu", "somaiya"],
    ["vit.edu.in", "vit"],
    ["dubaiprimelaw.ae", "dubaiprimelaw"],
  ])("extracts %s -> %s", (host, expected) => {
    expect(domainLabel(host)).toBe(expected);
  });
});
