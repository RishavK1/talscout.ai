import { DEFAULT_LEAD_QUALIFICATION, type BlueprintLeadQualification } from "@/server/ports";

const VALID_WEBSITE_REQUIREMENTS = new Set<BlueprintLeadQualification["websiteRequirement"]>([
  "any",
  "no_or_weak_site",
  "has_site",
]);

/** Defensive normalization for AI-generated `leadQualification` — the
 *  websiteRequirement enum isn't schema-enforced (this codebase's Gemini
 *  adapters describe enums in prose rather than a constrained `enum:`
 *  field), and older blueprints predate this field entirely. Anything
 *  malformed or absent degrades to "any" (no restriction, today's behavior). */
export function normalizeLeadQualification(
  value: BlueprintLeadQualification | null | undefined,
): BlueprintLeadQualification {
  if (!value || !VALID_WEBSITE_REQUIREMENTS.has(value.websiteRequirement)) {
    return DEFAULT_LEAD_QUALIFICATION;
  }
  return {
    websiteRequirement: value.websiteRequirement,
    criteria: Array.isArray(value.criteria) ? value.criteria.filter((c) => typeof c === "string") : [],
  };
}
