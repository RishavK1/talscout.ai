import { createHash } from "crypto";
import { getEnv } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import { normalizeUrl, domainFromWebsite } from "@/server/lib/safe-fetch";
import { parseJsonLoosely } from "@/server/adapters/openrouter.client";
import type { LeadDiscovery, LeadDiscoveryQuery, DiscoveredLead, RateLimiter } from "@/server/ports";

/**
 * AI-driven discovery source: one Perplexity Sonar live-web-search call per
 * campaign per tick, asking it to surface real, currently-operating
 * businesses matching the campaign's category/location/fit — genuinely new
 * coverage beyond the geometry-based sources (Overpass/Geoapify/Google
 * Places only ever return what's mapped as a POI). Uses PERPLEXITY_API_KEY,
 * the same "real-time web search" budget as WebResearcher/MarketResearcher
 * (NOT PERPLEXITY_API_KEY_PRIMARY, which fronts a different structured-
 * generation fallback chain).
 *
 * Only ever called when `query.aiDiscoveryEnabled` is true — see
 * ports/index.ts's LeadDiscoveryQuery doc comment for the structural
 * guarantee that absent/false means zero AI calls. Budget-capped via the
 * shared RateLimiter port; on exhaustion (or any failure) returns [],
 * fail-soft, so the rest of the discovery chain is unaffected.
 */

const CHAT_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const TICK_WINDOW_SECONDS = 21_600; // 6h, matches the campaign cron cadence
const TICK_BUDGET = 400;

interface Candidate {
  name?: unknown;
  website?: unknown;
  rationale?: unknown;
}

function sourcePlaceIdFor(name: string, website: string | undefined): string {
  const domain = domainFromWebsite(website);
  const basis = domain ?? name.trim().toLowerCase().replace(/\s+/g, " ");
  const hash = createHash("sha256").update(basis).digest("hex").slice(0, 24);
  return `ai:${hash}`;
}

function candidateToLead(c: Candidate): DiscoveredLead | null {
  if (typeof c.name !== "string" || !c.name.trim()) return null;
  const name = c.name.trim();
  const website =
    typeof c.website === "string" && c.website.trim() ? normalizeUrl(c.website) : undefined;
  return {
    sourcePlaceId: sourcePlaceIdFor(name, website ?? undefined),
    name,
    website: website ?? undefined,
  };
}

function systemPrompt(category: string, locationText: string, fitContext?: LeadDiscoveryQuery["fitContext"]): string {
  const fit = fitContext
    ? `\n\nThe outreach sender offers: ${fitContext.whatWeOffer}\nTheir ideal customer: ${fitContext.whoItsFor}` +
      (fitContext.leadQualification?.criteria.length
        ? `\nAdditional fit criteria: ${fitContext.leadQualification.criteria.join("; ")}`
        : "")
    : "";
  return (
    `You are helping find real, currently-operating "${category}" businesses in ` +
    `${locationText} for a B2B outreach campaign.${fit}\n\n` +
    "Search the live web and return ONLY businesses you have genuine search evidence " +
    "currently exist and operate in this location. Never invent a name or website — " +
    "it is far better to return fewer results than to pad the list with anything " +
    "unverified. Prefer businesses with a discoverable website.\n\n" +
    'Respond with ONLY a JSON object of the form {"candidates":[{"name":"...",' +
    '"website":"https://...","rationale":"one short sentence citing what you found"}]}. ' +
    "Omit \"website\" if you found no website for a business. No prose outside the JSON."
  );
}

export class PerplexityLeadDiscovery implements LeadDiscovery {
  constructor(private limiter: RateLimiter) {}

  async discover(query: LeadDiscoveryQuery): Promise<DiscoveredLead[]> {
    if (!query.aiDiscoveryEnabled) return [];
    const key = getEnv().PERPLEXITY_API_KEY;
    if (!key) return [];

    const rl = await this.limiter.limit("ai-lead-discovery:tick", TICK_BUDGET, TICK_WINDOW_SECONDS);
    if (!rl.success) {
      logger.warn({}, "perplexity_lead_discovery_budget_exhausted");
      return [];
    }

    const locationText = "text" in query.location ? query.location.text : `${query.location.lat},${query.location.lon}`;
    const known = query.excludeSourcePlaceIds ?? new Set<string>();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt(query.category, locationText, query.fitContext) },
            { role: "user", content: `Find up to ${query.limit} businesses. Return JSON only.` },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        logger.warn({ status: res.status }, "perplexity_lead_discovery_non_ok");
        return [];
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return [];

      const parsed = parseJsonLoosely<{ candidates?: Candidate[] }>(content);
      const byId = new Map<string, DiscoveredLead>();
      for (const c of parsed.candidates ?? []) {
        const lead = candidateToLead(c);
        if (!lead || byId.has(lead.sourcePlaceId) || known.has(lead.sourcePlaceId)) continue;
        byId.set(lead.sourcePlaceId, lead);
        if (byId.size >= query.limit) break;
      }
      return [...byId.values()];
    } catch (err) {
      logger.warn({ err }, "perplexity_lead_discovery_failed");
      return [];
    }
  }
}
