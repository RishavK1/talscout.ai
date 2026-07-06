import mammoth from "mammoth";
import { buildOutreachTemplatesBlock, type SequenceTemplates } from "@/server/lib/spintax";

/**
 * Docx lead import, ported from pixelorcode-ops's `src/lib/docxParser.js`
 * (`parsePlaybookText`) — same line-based state machine and heading/route/
 * template heuristics, adapted for a server-side Buffer instead of a browser
 * `FileReader`, and trimmed to the columns `outreachLeads` actually has
 * (CRM-only fields like `websiteStatus`/`proposalStatus`/`owner` etc. are
 * dropped — this is bulk-fire's own lead model, not a port of the CRM's CRM).
 */

export interface ParsedLead {
  name: string;
  niche?: string;
  location?: string;
  decisionMaker?: string;
  email?: string;
  phone?: string;
  notes?: string;
  templates: SequenceTemplates;
}

function cleanSignature(body: string): string {
  return body.trim();
}

export function parsePlaybookText(rawText: string): ParsedLead[] {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim());
  const leads: ParsedLead[] = [];

  let currentLead: (ParsedLead & { warningNotes: string[] }) | null = null;
  let currentTemplate: "day0" | "day3" | "day7" | null = null;

  for (const line of lines) {
    if (!line && !currentTemplate) continue;

    // New lead heading: "1. Peekabox..." / "12. Gainz..." — digits, dot, name.
    const leadHeadingMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (leadHeadingMatch) {
      if (currentLead) leads.push(finalizeLead(currentLead));
      const rawTitle = leadHeadingMatch[2];
      const cleanName = rawTitle.split(/★|◆|ROUTE/)[0].trim();
      currentLead = {
        name: cleanName,
        warningNotes: [],
        templates: { day0: { subject: "", body: "" }, day3: { subject: "", body: "" }, day7: { subject: "", body: "" } },
      };
      currentTemplate = null;
      continue;
    }

    if (!currentLead) continue;

    // "What they do: ... in <Location>." — description doubles as a location hint.
    if (line.toLowerCase().startsWith("what they do:")) {
      const locationMatch = line.match(/in\s+([A-Za-z\s]+)(?:;|\.|,|$)/i);
      if (locationMatch) currentLead.location = locationMatch[1].trim();
      continue;
    }

    // "Founders: Jane Doe (CEO) · John Smith" — first name before separators is the DM.
    if (line.toLowerCase().startsWith("founders:")) {
      const founders = line.replace(/founders:/i, "").trim();
      currentLead.decisionMaker = founders.split("·")[0].split("(")[0].trim();
      continue;
    }

    const emailInLine = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    if (
      line.includes("✅ Verified email") ||
      line.toLowerCase().includes("verified email") ||
      (emailInLine &&
        (line.toLowerCase().includes("verified") || line.toLowerCase().includes("send today")))
    ) {
      if (emailInLine) currentLead.email = emailInLine[0].trim();
      continue;
    }

    if (emailInLine && !currentLead.email) {
      currentLead.email = emailInLine[0].trim();
      continue;
    }

    if (
      line.startsWith("◆ Send route") ||
      line.toLowerCase().includes("send route") ||
      line.toLowerCase().includes("route:")
    ) {
      const phoneMatch = line.match(/\+?\d[\d\s-]{8,}\d/);
      if (phoneMatch) currentLead.phone = phoneMatch[0].trim();
      continue;
    }

    if (line.startsWith("⚑") || line.toLowerCase().startsWith("flag") || line.toLowerCase().startsWith("warning")) {
      currentLead.warningNotes.push(line);
      continue;
    }

    // Template section headers.
    if (line.toLowerCase().includes("email 1") || line.toLowerCase().includes("day 0")) {
      currentTemplate = "day0";
      continue;
    }
    if (line.toLowerCase().includes("follow-up 1") || line.toLowerCase().includes("day 3")) {
      currentTemplate = "day3";
      continue;
    }
    if (line.toLowerCase().includes("follow-up 2") || line.toLowerCase().includes("day 7")) {
      currentTemplate = "day7";
      continue;
    }

    if (currentTemplate) {
      const tpl = currentLead.templates[currentTemplate]!;
      if (line.startsWith("Subject:")) {
        tpl.subject = line.replace(/^Subject:/i, "").trim();
      } else {
        tpl.body = tpl.body ? `${tpl.body}\n${line}` : line;
      }
    }
  }

  if (currentLead) leads.push(finalizeLead(currentLead));
  return leads;
}

function finalizeLead(lead: ParsedLead & { warningNotes: string[] }): ParsedLead {
  for (const key of ["day0", "day3", "day7"] as const) {
    const tpl = lead.templates[key];
    if (tpl) {
      tpl.subject = (tpl.subject || "").trim();
      tpl.body = cleanSignature(tpl.body || "");
    }
  }
  const notes = [lead.warningNotes.join("\n"), buildOutreachTemplatesBlock(lead.templates)]
    .filter(Boolean)
    .join("\n");
  return {
    name: lead.name,
    niche: lead.niche,
    location: lead.location,
    decisionMaker: lead.decisionMaker,
    email: lead.email,
    phone: lead.phone,
    notes,
    templates: lead.templates,
  };
}

/** Extracts raw text from a .docx buffer, then runs it through the parser. */
export async function parseLeadsDocx(buffer: Buffer): Promise<ParsedLead[]> {
  const result = await mammoth.extractRawText({ buffer });
  return parsePlaybookText(result.value);
}
