/**
 * Anti-spam / deliverability logic ported from pixelorcode-ops's
 * `src/lib/fireQueue.js`. Two pieces:
 *
 *  1. Spintax `{a|b|c}` resolution + `{{placeholder}}` substitution, so every
 *     send in a campaign reads as distinct wording rather than an identical
 *     mail-merge blast.
 *  2. Sequential block+jitter scheduling: at most one send per sender account
 *     per block window, with a random offset inside the block — this is what
 *     keeps a mailbox looking human-paced. Generalized here across multiple
 *     sender accounts (the CRM only ever had one), each with its own block
 *     cursor, so total throughput scales with account count.
 */

export interface OutreachLeadFields {
  name: string;
  niche?: string | null;
  location?: string | null;
  decisionMaker?: string | null;
  email?: string | null;
  rating?: string | null;
  reviews?: string | null;
}

function getFirstName(lead: OutreachLeadFields): string {
  const name = String(lead.decisionMaker || "").trim();
  if (!name || /not (found|added|available|confirmed)/i.test(name)) return "";
  const cleanName = name.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "");
  return cleanName.split(/\s+/)[0];
}

/**
 * Resolves Spintax curly-bracket options (`{option1|option2}`) and
 * placeholders (`{{Name}}`, `{{Company}}`, `{domain}`, ...) case-insensitively.
 * Ported verbatim from `processSpintaxAndPlaceholders` — same token set, same
 * random-pick spintax behavior — just typed and Buffer/DOM-free.
 */
export function resolveSpintaxAndPlaceholders(
  text: string | null | undefined,
  lead: OutreachLeadFields,
  senderName = "",
  senderEmail = "",
): string {
  if (!text) return "";
  let current = text;

  let iterations = 0;
  const maxIterations = 20;

  while (current.includes("{") && current.includes("}") && iterations < maxIterations) {
    iterations++;
    const nextRegex = /\{([^{}]+)\}/g;
    let replacedAny = false;

    current = current.replace(nextRegex, (_match, innerContent: string) => {
      replacedAny = true;

      if (innerContent.includes("|")) {
        const parts = innerContent.split("|");
        const randomIndex = Math.floor(Math.random() * parts.length);
        return parts[randomIndex];
      }

      const cleanContent = innerContent.trim().toLowerCase();
      if (cleanContent === "name") return lead.decisionMaker || lead.name || "";
      if (cleanContent === "firstname" || cleanContent === "first_name") {
        return getFirstName(lead) || lead.name || "";
      }
      if (
        cleanContent === "company" ||
        cleanContent === "practice" ||
        cleanContent === "clinicname" ||
        cleanContent === "clinic_name" ||
        cleanContent === "centrename" ||
        cleanContent === "centre_name" ||
        cleanContent === "businessname" ||
        cleanContent === "business_name"
      ) {
        return lead.name || "";
      }
      if (cleanContent === "niche" || cleanContent === "specialty" || cleanContent === "industry") {
        return lead.niche || "";
      }
      if (cleanContent === "location" || cleanContent === "locality" || cleanContent === "city") {
        return lead.location || "";
      }
      if (cleanContent === "rating") return lead.rating || "";
      if (cleanContent === "reviews" || cleanContent === "review_count") return lead.reviews || "";
      if (cleanContent === "domain") {
        if (lead.email && lead.email.includes("@")) return lead.email.split("@")[1];
        return lead.name || "";
      }
      if (cleanContent === "year") return new Date().getFullYear().toString();
      if (cleanContent === "sendername" || cleanContent === "sender_name" || cleanContent === "sender") {
        return senderName || "";
      }
      if (cleanContent === "senderemail" || cleanContent === "sender_email") return senderEmail || "";

      // Unrecognized token — strip the braces rather than leak them into the send.
      return innerContent;
    });

    if (!replacedAny) break;
  }

  return current;
}

export interface SequenceTemplate {
  subject: string;
  body: string;
}

export type SequenceStepKey = "day0" | "day3" | "day7";
export type SequenceTemplates = Partial<Record<SequenceStepKey, SequenceTemplate>>;

const TEMPLATES_MARKER_START = "--- OUTREACH_TEMPLATES ---";
const TEMPLATES_MARKER_END = "--------------------------";

/**
 * Docx-imported leads carry their own bespoke per-lead copy (the playbook
 * writes a distinct pitch per lead, not one shared blast) embedded in the
 * lead's `notes` using this marker block — same convention as the CRM, so a
 * lead's personalized templates survive the import.
 */
export function getOutreachTemplates(notes: string | null | undefined): SequenceTemplates | null {
  if (!notes) return null;
  const pattern = new RegExp(
    `${TEMPLATES_MARKER_START}\\r?\\n([\\s\\S]*?)\\r?\\n${TEMPLATES_MARKER_END}`,
  );
  const match = notes.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Embeds parsed per-lead templates into `notes`, for the docx importer. */
export function buildOutreachTemplatesBlock(templates: SequenceTemplates): string {
  return `${TEMPLATES_MARKER_START}\n${JSON.stringify(templates, null, 2)}\n${TEMPLATES_MARKER_END}\n`;
}

export interface ScheduledSend {
  leadId: string;
  senderAccountId: string;
  scheduledAt: Date;
}

/**
 * Assigns each (lead, step) pair a sender account — round-robin across the
 * active, connected accounts — and a target send time using the CRM's
 * sequential block+jitter algorithm: block N spans
 * `[N * blockMs, (N+1) * blockMs)` after `now`, and the actual send lands at
 * a random offset inside its block. Each sender account gets its own block
 * cursor (`fireQueue.js` only ever had one account, hence one cursor), so a
 * campaign with 3 connected mailboxes sends roughly 3x as fast while each
 * individual mailbox still looks paced at one email per block.
 */
export function scheduleSends(params: {
  leadIds: string[];
  senderAccountIds: string[];
  blockMinutes: number;
  now: Date;
}): ScheduledSend[] {
  if (params.senderAccountIds.length === 0) return [];
  const blockMs = params.blockMinutes * 60_000;
  const cursors = new Map<string, number>(params.senderAccountIds.map((id) => [id, 0]));

  return params.leadIds.map((leadId, i) => {
    const senderAccountId = params.senderAccountIds[i % params.senderAccountIds.length];
    const blockIndex = cursors.get(senderAccountId) ?? 0;
    cursors.set(senderAccountId, blockIndex + 1);

    const targetOffsetMs = blockIndex * blockMs + Math.random() * blockMs;
    return {
      leadId,
      senderAccountId,
      scheduledAt: new Date(params.now.getTime() + targetOffsetMs),
    };
  });
}
