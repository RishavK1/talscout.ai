import type {
  BlueprintResearcher,
  BlueprintGenerator,
  BlueprintSuggestions,
  BlueprintIntakeAnswers,
  BlueprintSections,
  BlueprintLeadQualification,
} from "@/server/ports";

/**
 * Deterministic mock blueprint adapters for APP_MODE=mock + tests — no keys,
 * no network. The wizard runs end-to-end against these: `suggest` returns a
 * fixed set of intake questions with plausible options derived from the input
 * name, and `generate` echoes the confirmed answers into a fully-populated
 * blueprint. Mirrors the discipline the real adapter needs (treat site text as
 * data), just without an actual model call.
 *
 * Test sentinels (in the website URL / name): `%%THROW%%` simulates a provider
 * failure so the service's error path can be exercised.
 */

const FIELD_QUESTIONS: { field: string; question: string; multi: boolean }[] = [
  { field: "whatWeSell", question: "What do you sell?", multi: false },
  { field: "icp", question: "Who is it for (ideal customer)?", multi: false },
  { field: "differentiator", question: "What makes you different?", multi: false },
  { field: "proof", question: "What proof points back that up?", multi: true },
  { field: "voice", question: "What tone should outreach use?", multi: false },
  { field: "objections", question: "What objections do prospects raise?", multi: true },
  { field: "websiteRequirement", question: "Does a good lead already have a website, or not?", multi: false },
];

export class MockBlueprintResearcher implements BlueprintResearcher {
  async suggest(args: {
    websiteUrl: string;
    name: string;
  }): Promise<BlueprintSuggestions> {
    if (args.websiteUrl.includes("%%THROW%%") || args.name.includes("%%THROW%%")) {
      throw new Error("mock blueprint researcher provider failure");
    }
    const n = args.name.trim() || "Your Business";
    return {
      businessName: n,
      // Deterministic stand-in for the real adapters' researched paragraph —
      // lets the wizard's pre-fill wiring be exercised without a network call.
      draftContext: `We are ${n}. We help small teams get more done, and our customers stay with us because onboarding is fast.`,
      fields: FIELD_QUESTIONS.map((q) => ({
        field: q.field,
        question: q.question,
        multi: q.multi,
        options: optionsFor(q.field, n),
      })),
    };
  }
}

function optionsFor(field: string, name: string): string[] {
  switch (field) {
    case "whatWeSell":
      return [
        `${name}'s core product`,
        `A managed service from ${name}`,
        `A self-serve platform`,
      ];
    case "icp":
      return [
        "Small-to-midsize businesses",
        "Enterprise teams",
        "Early-stage startups",
      ];
    case "differentiator":
      return [
        "Faster time to value",
        "Lower total cost",
        "Best-in-class support",
      ];
    case "proof":
      return [
        "Used by 100+ teams",
        "4.8/5 average rating",
        "Backed by measurable ROI",
      ];
    case "voice":
      return ["Friendly and direct", "Professional and concise", "Warm and consultative"];
    case "objections":
      return [
        "Too expensive",
        "Already using a competitor",
        "No time to switch",
      ];
    case "websiteRequirement":
      return [
        "No preference",
        "Target businesses WITHOUT a good website",
        "Target businesses that already HAVE a website",
      ];
    default:
      return ["Option A", "Option B", "Option C"];
  }
}

function mapWebsiteRequirement(answer: string): BlueprintLeadQualification["websiteRequirement"] {
  if (answer.includes("WITHOUT")) return "no_or_weak_site";
  if (answer.includes("already HAVE")) return "has_site";
  return "any";
}

export class MockBlueprintGenerator implements BlueprintGenerator {
  async generate(input: BlueprintIntakeAnswers): Promise<BlueprintSections> {
    if ((input.websiteUrl ?? "").includes("%%THROW%%")) {
      throw new Error("mock blueprint generator provider failure");
    }
    const a = input.answers ?? {};
    const one = (k: string, fallback: string): string => {
      const v = a[k];
      if (Array.isArray(v)) return v[0] ?? fallback;
      return (v as string) ?? fallback;
    };
    const many = (k: string): string[] => {
      const v = a[k];
      if (Array.isArray(v)) return v.filter(Boolean);
      return v ? [v as string] : [];
    };
    const name = input.businessName?.trim() || "Your Business";
    // additionalContext is the wizard's free-text "tell us everything" box —
    // echoed into painWeSolve and leadQualification.criteria (its most
    // consequential downstream use) so mock mode and tests exercise the same
    // wiring the real Gemini/OpenRouter adapters give it priority treatment for.
    const notes = (a.additionalContext as string | undefined)?.trim();
    return {
      whoWeAre: `${name} — ${one("whatWeSell", "a product company")}.`,
      whatWeOffer: one("whatWeSell", "Our core offering."),
      whoItsFor: one("icp", "Our ideal customers."),
      statusQuo: "Most teams solve this manually today.",
      differentiator: one("differentiator", "What sets us apart."),
      painWeSolve: notes
        ? `We help ${one("icp", "customers")} avoid the cost of the status quo. ${notes}`
        : `We help ${one("icp", "customers")} avoid the cost of the status quo.`,
      proof: (many("proof").length ? many("proof") : ["Proven results"]).map((label) => ({
        label,
      })),
      personas: [{ name: one("icp", "Decision maker") }],
      voice: one("voice", "Professional and concise"),
      objections: many("objections").length ? many("objections") : ["Not now"],
      rules: [
        "Never invent facts not grounded in this blueprint.",
        "Keep emails short, specific, and personalized.",
      ],
      leadQualification: {
        websiteRequirement: mapWebsiteRequirement(one("websiteRequirement", "No preference")),
        criteria: notes ? [notes] : [],
      },
    };
  }
}
