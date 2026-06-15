import type { ResumeProfile } from "@/server/validation/resume-profile";

/**
 * Deterministic post-extraction cleanup. The LLM extractor is good but not
 * consistent: it returns "ReactJS" / "React.js" / "react", duplicate emails,
 * empty strings, stray whitespace, and sometimes omits yearsExperience. Loose
 * fields hurt everything downstream — the embedding text, structured filters
 * (skills/experience), and the profile UI. We normalize here, AFTER schema
 * validation, so what we persist is clean and comparable across candidates.
 *
 * This is pure and side-effect free; it never invents data, only tidies it.
 */

/** Canonical display forms for skills people write many ways. Key = lowercased,
 *  punctuation-stripped variant; value = the form we store. Extend as needed. */
const SKILL_CANON: Record<string, string> = {
  reactjs: "React",
  react: "React",
  reactnative: "React Native",
  nodejs: "Node.js",
  node: "Node.js",
  nextjs: "Next.js",
  vuejs: "Vue.js",
  vue: "Vue.js",
  angularjs: "Angular",
  angular: "Angular",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  golang: "Go",
  cplusplus: "C++",
  csharp: "C#",
  dotnet: ".NET",
  aws: "AWS",
  gcp: "Google Cloud",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  tailwindcss: "Tailwind CSS",
  tailwind: "Tailwind CSS",
};

function squish(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Normalize one skill to its canonical display form (or a tidied original). */
function canonSkill(raw: string): string {
  const tidy = squish(raw);
  const key = tidy.toLowerCase().replace(/[.\-_/\s]/g, "");
  return SKILL_CANON[key] ?? tidy;
}

/** Trim, drop empties, and dedupe case-insensitively keeping first display form. */
function cleanStrings(
  arr: string[] | undefined,
  transform: (s: string) => string = squish,
): string[] | undefined {
  if (!arr) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const v = transform(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out : undefined;
}

/** Parse a year out of a free-form date string ("Jan 2021", "2019", "Present"). */
function yearOf(s: string | undefined, fallback?: number): number | undefined {
  if (!s) return fallback;
  if (/present|current|now/i.test(s)) return new Date().getUTCFullYear();
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : fallback;
}

/** Best-effort total years of experience from the work history spans, when the
 *  model didn't give a number. Uses the earliest start → latest end. */
function deriveYears(p: ResumeProfile): number | undefined {
  const work = p.workHistory ?? [];
  if (!work.length) return undefined;
  const thisYear = new Date().getUTCFullYear();
  let earliest = Infinity;
  let latest = -Infinity;
  for (const w of work) {
    const start = yearOf(w.startDate);
    const end = yearOf(w.endDate, start);
    if (start != null && start <= thisYear) earliest = Math.min(earliest, start);
    if (end != null && end <= thisYear) latest = Math.max(latest, end);
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return undefined;
  const span = latest - earliest;
  return span > 0 && span <= 80 ? span : undefined;
}

export function normalizeProfile(p: ResumeProfile): ResumeProfile {
  const skills = cleanStrings(p.skills, canonSkill);
  const emails = cleanStrings(p.emails, (s) => squish(s).toLowerCase());

  const out: ResumeProfile = {
    ...p,
    fullName: squish(p.fullName),
    currentTitle: p.currentTitle ? squish(p.currentTitle) : undefined,
    location: p.location ? squish(p.location) : undefined,
    summary: p.summary ? squish(p.summary) : undefined,
    emails,
    phones: cleanStrings(p.phones),
    skills,
    languages: cleanStrings(p.languages),
    certifications: cleanStrings(p.certifications),
  };

  // Fill experience from work history if the model omitted it; clamp the range.
  if (out.yearsExperience == null) {
    const derived = deriveYears(p);
    if (derived != null) out.yearsExperience = derived;
  } else {
    out.yearsExperience = Math.min(80, Math.max(0, out.yearsExperience));
  }

  return out;
}
