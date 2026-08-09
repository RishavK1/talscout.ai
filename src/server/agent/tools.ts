import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { withTenantTx } from "@/server/db/tx";
import { searchService } from "@/server/services/search.service";
import { blueprintService } from "@/server/services/blueprint.service";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { outreachService } from "@/server/services/outreach.service";
import { candidateService } from "@/server/services/candidate.service";
import { teamService } from "@/server/services/team.service";
import { billingService } from "@/server/services/billing.service";
import { tenantRepo } from "@/server/repositories/tenant.repo";
import { subscriptionRepo } from "@/server/repositories/subscription.repo";
import { candidateRepo } from "@/server/repositories/candidate.repo";
import { shortlistRepo } from "@/server/repositories/shortlist.repo";
import { automatedSendRepo, automatedCampaignRepo, automatedLeadRepo } from "@/server/repositories/automated-outreach.repo";
import { outreachSendRepo, senderAccountRepo } from "@/server/repositories/outreach.repo";
import { toCredentials, generateMessageId } from "@/server/lib/automated-mail-credentials";
import { getServices } from "@/server/container";
import { agentSkillsService } from "@/server/services/agent-skills.service";
import { agentSkillRepo } from "@/server/repositories/agent-skill.repo";
import { agentTasksService } from "@/server/services/agent-tasks.service";
import { agentTaskRepo } from "@/server/repositories/agent-task.repo";

/** The exact category set the discovery backend has a real OpenStreetMap/
 *  Geoapify tag mapping for (see BUSINESS_CATEGORIES in the campaign
 *  wizard's own discovery-options.ts — this is that same list, not a
 *  guess). Free-typing anything outside this list has silently returned
 *  ZERO leads in production before ("Education" isn't a literal OSM tag),
 *  so the agent needs the same guardrail the wizard's own UI gives a human:
 *  a real list to pick from, not open-ended free text. */
const CAMPAIGN_CATEGORIES = [
  "restaurant", "cafe", "bakery", "bar", "hotel", "dentist", "doctor", "clinic",
  "pharmacy", "veterinary", "gym", "spa", "salon", "lawyer", "accountant",
  "real estate", "plumber", "electrician", "auto repair", "education",
] as const;

/**
 * In-house tool registry — thin wrappers around EXISTING, already-tested
 * service methods. No new business logic lives here; the agent is just a
 * new caller of code the UI already calls (same principle as everything
 * else in this app's ports/adapters architecture).
 *
 * Coverage is intentionally starting small (search + blueprints) rather
 * than wrapping every mutating route at once — see the system design doc's
 * "coverage principle": the target is eventually covering everything the
 * UI can do, tracked and grown incrementally, not claimed complete on day
 * one. Each tool's `execute` opens its own short-lived `withTenantTx` for
 * exactly the duration of that one call, per the pool-pressure guidance in
 * the same doc — the streamed turn itself never holds a transaction open.
 */
export function buildInHouseTools(
  identity: { tenantId: string; userId: string; conversationId: string },
  appOrigin: string,
): ToolSet {
  return {
    search_candidates: tool({
      description:
        "Semantically search this workspace's candidates. Use this whenever the user asks to find, " +
        "search for, or shortlist candidates matching some description, skills, location, or experience level. " +
        "Describe EVERYTHING the user is looking for — skills, role, seniority — in the `query` field as natural " +
        "language (e.g. 'senior full-stack developer with React, Next.js, and MongoDB experience'). Do not rely on " +
        "the optional `skills` field for this: it only matches candidates whose skill list contains that EXACT " +
        "string, so a candidate whose skill is literally 'React' will be missed by a filter of 'React.js' — the " +
        "semantic `query` handles phrasing differences like that correctly and should be your default. Only add " +
        "`skills` when the user explicitly wants a strict, narrow filter and you're using their exact wording.",
      inputSchema: z.object({
        query: z.string().max(500).describe("Natural-language description of who you're looking for, including any required skills"),
        location: z.string().max(200).optional(),
        minExperience: z.number().min(0).max(80).optional().describe("Minimum years of experience"),
        skills: z
          .array(z.string().max(80))
          .max(20)
          .optional()
          .describe("Strict exact-match filter — rarely needed, see the tool description"),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (input) => {
        const result = await withTenantTx(identity, (ctx) =>
          searchService.search(ctx, {
            q: input.query,
            location: input.location,
            minExperience: input.minExperience,
            skills: input.skills,
            limit: input.limit ?? 10,
          }),
        );
        return {
          count: result.count,
          candidates: result.results.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            currentTitle: r.currentTitle,
            location: r.location,
            yearsExperience: r.yearsExperience,
            // Capped — a real profile can carry 40+ skills (seen in prod
            // data), and sending all of them for every result in every
            // search needlessly inflates token cost for no benefit; the
            // top slice is enough for the model to summarize a match.
            skills: (r.skills ?? []).slice(0, 12),
            matchReason: r.matchReason ?? null,
          })),
        };
      },
    }),

    get_workspace_stats: tool({
      description:
        "Get workspace-wide numbers covering EVERY outreach system in this app, not just one: candidates " +
        "(total, ready vs. still processing), blueprints, Automated Outreach campaigns (total + active/paused/" +
        "draft breakdown) AND separately Bulk Fire campaigns (a different, manual-template outreach system — " +
        "total + running/paused/draft breakdown), emails actually sent by each system separately, PLUS a " +
        "combined total emails sent across both systems, and shortlists. Use this whenever the user asks 'how " +
        "many...', for totals/counts/emails-sent, or a general overview of the workspace — always report both " +
        "systems, not just Automated Outreach, since this app has two independent outreach engines.",
      inputSchema: z.object({}),
      execute: async () => {
        return await withTenantTx(identity, async (ctx) => {
          const [
            totalCandidates,
            readyCandidates,
            processingCandidates,
            blueprints,
            automatedCampaigns,
            automatedEmailsSent,
            bulkFireCampaigns,
            bulkFireEmailsSent,
            shortlistCount,
          ] = await Promise.all([
            candidateRepo.count(ctx),
            candidateRepo.count(ctx, { status: "ready" }),
            candidateRepo.count(ctx, { status: "processing" }),
            blueprintService.list(ctx),
            automatedOutreachService.listCampaigns(ctx),
            automatedSendRepo.countSentTotal(ctx),
            outreachService.listCampaigns(ctx),
            outreachSendRepo.countSentTotal(ctx),
            shortlistRepo.countByTenant(ctx),
          ]);
          return {
            candidates: { total: totalCandidates, ready: readyCandidates, processing: processingCandidates },
            blueprints: { total: blueprints.length },
            automatedOutreach: {
              campaigns: {
                total: automatedCampaigns.length,
                active: automatedCampaigns.filter((c) => c.status === "active").length,
                paused: automatedCampaigns.filter((c) => c.status === "paused").length,
                draft: automatedCampaigns.filter((c) => c.status === "draft").length,
              },
              emailsSent: automatedEmailsSent,
            },
            bulkFire: {
              campaigns: {
                total: bulkFireCampaigns.length,
                running: bulkFireCampaigns.filter((c) => c.status === "running").length,
                paused: bulkFireCampaigns.filter((c) => c.status === "paused").length,
                draft: bulkFireCampaigns.filter((c) => c.status === "draft").length,
              },
              emailsSent: bulkFireEmailsSent,
            },
            totalEmailsSentAcrossAllSystems: automatedEmailsSent + bulkFireEmailsSent,
            shortlists: { total: shortlistCount },
          };
        });
      },
    }),

    list_blueprints: tool({
      description: "List this workspace's existing blueprints (ideal-customer-profile documents).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await withTenantTx(identity, (ctx) => blueprintService.list(ctx));
        // Scale-plan workspaces have no blueprint cap — bound what's sent
        // to the model regardless, same reasoning as search_candidates'
        // skills truncation above.
        return {
          count: rows.length,
          blueprints: rows.slice(0, 50).map((b) => ({ id: b.id, name: b.name, status: b.status })),
        };
      },
    }),

    create_blueprint: tool({
      description:
        "Create a new blueprint (ideal-customer-profile document — who this agency should pitch, NOT a " +
        "candidate/hiring profile) for this workspace. Use when the user asks to create, set up, or start a new " +
        "blueprint. Ask for a name first if they haven't given one; a website URL is optional but strongly " +
        "recommended — if given, follow up with research_blueprint_website next (see that tool), the same " +
        "auto-research the blueprint page's own 'Generate' button does, rather than asking the user to type out " +
        "everything about their business by hand.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        websiteUrl: z.string().max(2000).optional(),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          blueprintService.create(ctx, { name: input.name, websiteUrl: input.websiteUrl }),
        );
        return { id: row.id, name: row.name, status: row.status, url: `/blueprints/${row.id}` };
      },
    }),

    research_blueprint_website: tool({
      description:
        "Step 2 of the blueprint wizard (same as clicking 'Generate' on the blueprint page): fetches the " +
        "given website and returns AI-suggested answers for this blueprint — a set of questions, each with " +
        "multiple-choice options (some allow more than one selection), plus a draft description of the " +
        "business. Call this right after create_blueprint whenever a website URL is available, BEFORE asking " +
        "the user anything else. Then show the user the suggested fields (question + options) and let them " +
        "confirm or adjust — don't invent your own unrelated questions (like candidate skills or job titles; " +
        "a blueprint describes the AGENCY'S OWN business/offer, not a hiring requirement). Once answers are " +
        "confirmed, call generate_blueprint with them.",
      inputSchema: z.object({
        websiteUrl: z.string().max(2000),
        name: z.string().max(200).describe("The blueprint's/business's name"),
      }),
      execute: async (input) => {
        const suggestions = await withTenantTx(identity, (ctx) =>
          blueprintService.suggestFromWebsite(ctx, { websiteUrl: input.websiteUrl, name: input.name }),
        );
        return {
          businessName: suggestions.businessName ?? null,
          draftContext: suggestions.draftContext ?? null,
          questions: suggestions.fields.map((f) => ({
            field: f.field,
            question: f.question,
            options: f.options,
            allowMultipleAnswers: f.multi,
          })),
        };
      },
    }),

    generate_blueprint: tool({
      description:
        "Step 3 of the blueprint wizard (final step): takes the user's confirmed answers to the questions from " +
        "research_blueprint_website and generates the finished blueprint — business description, offer, target " +
        "customer, differentiator, proof points, personas, objections, and rules — then saves it and marks the " +
        "blueprint active. Each entry's `field` must be one of the exact `field` keys returned by " +
        "research_blueprint_website, with `value` being the option(s) the user picked (for a multi-select " +
        "question, join the chosen options with a comma into one string). If the user skipped " +
        "research_blueprint_website and just described their business in plain language instead, pass a single " +
        "entry like {field: \"about\", value: \"<what they told you>\"} — generation works from freeform " +
        "answers too, it doesn't require the exact suggested field keys.",
      inputSchema: z.object({
        blueprintId: z.string(),
        businessName: z.string().max(200).optional(),
        websiteUrl: z.string().max(2000).optional(),
        answers: z
          .array(z.object({ field: z.string().max(100), value: z.string().max(2000) }))
          .max(30)
          .describe("Confirmed answers, one entry per question"),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          blueprintService.generate(ctx, input.blueprintId, {
            businessName: input.businessName,
            websiteUrl: input.websiteUrl,
            answers: Object.fromEntries(input.answers.map((a) => [a.field, a.value])),
          }),
        );
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          url: `/blueprints/${row.id}`,
          sections: row.sections,
        };
      },
    }),

    list_sender_accounts: tool({
      description:
        "List this workspace's connected sending mailboxes (Gmail/SMTP). An automated campaign must be sent " +
        "from one of these — call this before create_campaign to get a valid senderAccountId, and only offer " +
        "the user accounts where isActive is true.",
      inputSchema: z.object({}),
      execute: async () => {
        const senders = await withTenantTx(identity, (ctx) => outreachService.listSenders(ctx));
        return {
          senders: senders
            .filter((s) => s.isActive)
            .map((s) => ({
              id: s.id,
              type: s.type,
              label: s.label,
              email: s.email,
              supportsReplyPolling: s.type === "gmail" && s.gmailHasReadScope,
            })),
        };
      },
    }),

    research_campaign_market: tool({
      description:
        "Optional campaign wizard 'Research' step: AI research on a target market (category + location) " +
        "grounded in the chosen blueprint's own positioning, producing a short paragraph you can pass as " +
        "`marketResearch` on create_campaign. Purely optional and can be skipped — tell the user that if they'd " +
        "rather not wait for it.",
      inputSchema: z.object({
        blueprintId: z.string(),
        category: z.enum(CAMPAIGN_CATEGORIES),
        location: z.string().max(200).describe("A real place name, e.g. 'Austin, TX' or 'Mumbai, Maharashtra'"),
      }),
      execute: async (input) => {
        const result = await withTenantTx(identity, (ctx) => automatedOutreachService.researchMarket(ctx, input));
        return { research: result.research ?? "(no research available on this plan or for this market)" };
      },
    }),

    create_campaign: tool({
      description:
        "Creates a new automated outreach campaign as a DRAFT — this does NOT start sending emails or " +
        "searching for leads; a draft is completely inert until separately activated. Matches the app's own " +
        "4-step wizard (Start / Research / Voice & signature / Review & launch) exactly — ask the user about " +
        "EVERY field below before calling this, including the optional ones, and NEVER silently omit a field " +
        "from this call just because it has a default — decide its value from what the user actually told you, " +
        "not from letting it fall through unset. An optional field having a default does not mean skip asking " +
        "about it — in the real wizard it's still a visible box/toggle the user sees and can change.\n" +
        "REQUIRED (the call fails without these): name; blueprintId — must be an ACTIVE blueprint (call " +
        "list_blueprints first; generate_blueprint it first if it's still a draft); senderAccountId (call " +
        "list_sender_accounts first); category — MUST be one of the exact enum values, not a synonym or " +
        "anything free-typed; location — a real, specific place (city + region/country, e.g. 'Austin, TX' or " +
        "'Karnal, Haryana'), never left vague; signatureName.\n" +
        "OPTIONAL, but ask about every one and pass an explicit value based on the answer (never just omit it): " +
        "signatureTitle (a role/title under the name in the email signature); signatureClosing (default " +
        "'Best regards' if they don't care); styleExamples (1-2 example emails to match the writing style/tone " +
        "of, skippable but ask); maxLeadsPerRun (how many leads to find per run, default 25); " +
        "replyPollingEnabled (auto-pause follow-ups when a lead replies, default ON — only possible if the " +
        "chosen sender's supportsReplyPolling from list_sender_accounts is true); aiDiscoveryEnabled (an extra " +
        "AI-powered live-web-search discovery source on top of the free structured-directory search, DEFAULT " +
        "OFF — explicitly recommend turning this ON whenever the location isn't a major metro area, since the " +
        "free directory sources (OpenStreetMap/Geoapify) have much thinner business coverage outside large " +
        "Western cities and a campaign can otherwise sit active finding zero leads with no error at all; still " +
        "the user's call, but say why you're recommending it rather than silently picking a default for them). " +
        "After this succeeds, ALWAYS explicitly ask the user whether to activate the campaign now (activating " +
        "starts real lead discovery and sending real emails) — NEVER call activate_campaign without them " +
        "clearly saying yes to that specific question in their next message.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        blueprintId: z.string(),
        senderAccountId: z.string(),
        category: z.enum(CAMPAIGN_CATEGORIES),
        location: z.string().max(200),
        maxLeadsPerRun: z.number().int().min(1).max(100).optional().describe("Default 25"),
        signatureName: z.string().min(1).max(200),
        signatureTitle: z.string().max(200).optional(),
        signatureClosing: z.string().max(100).optional().describe("Default 'Best regards'"),
        marketResearch: z.string().max(4000).optional(),
        replyPollingEnabled: z
          .boolean()
          .optional()
          .describe("Only works with a Gmail sender that has read access — see list_sender_accounts"),
        aiDiscoveryEnabled: z.boolean().optional(),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          automatedOutreachService.createCampaign(ctx, {
            name: input.name,
            blueprintId: input.blueprintId,
            senderAccountId: input.senderAccountId,
            discoveryQuery: { category: input.category, location: { text: input.location } },
            maxLeadsPerRun: input.maxLeadsPerRun,
            signatureName: input.signatureName,
            signatureTitle: input.signatureTitle,
            signatureClosing: input.signatureClosing,
            marketResearch: input.marketResearch,
            replyPollingEnabled: input.replyPollingEnabled,
            aiDiscoveryEnabled: input.aiDiscoveryEnabled,
          }),
        );
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          url: `/automated-outreach/${row.id}`,
        };
      },
    }),

    activate_campaign: tool({
      description:
        "Activates a draft/paused campaign — this is the SENSITIVE, real-world-effect step: it immediately " +
        "starts searching for real leads and will send real emails on the schedule that follows. Same effect as " +
        "the campaign page's 'Activate' button. ONLY call this when the user has explicitly confirmed they want " +
        "to activate THIS SPECIFIC campaign in their most recent message (e.g. after you asked and they said " +
        "yes) — never as an automatic follow-up to create_campaign, never inferred, never 'to be helpful'.",
      inputSchema: z.object({
        campaignId: z.string(),
      }),
      execute: async (input) => {
        const { result, afterCommit } = await withTenantTx(identity, (ctx) =>
          automatedOutreachService.resumeCampaign(ctx, input.campaignId),
        );
        // Same "only after the activating transaction has actually
        // committed" ordering the real /resume API route follows (see its
        // own doc comment) — enqueuing the discovery job any earlier could
        // race a concurrent reader still seeing the pre-activation status.
        await afterCommit();
        return { id: result.id, name: result.name, status: result.status, url: `/automated-outreach/${result.id}` };
      },
    }),

    list_campaigns: tool({
      description:
        "Lists this workspace's automated outreach campaigns with their status and lead counts so far. Use " +
        "this whenever the user asks how a campaign is doing, why it hasn't found any leads, or wants a status " +
        "check after activating one — discovery runs on a schedule (not instantly), so 'nothing yet' minutes " +
        "after activating is normal, but if leadsFound stays at 0 across multiple runs (check lastDiscoveryRunAt), " +
        "the likely cause is sparse coverage for that category/location combination in the free structured " +
        "directories, especially outside major metro areas — tell the user this plainly and suggest either " +
        "turning on aiDiscoveryEnabled (update the campaign) or trying a broader/different location, rather " +
        "than leaving them guessing why it looks stuck.",
      inputSchema: z.object({}),
      execute: async () => {
        const campaigns = await withTenantTx(identity, (ctx) => automatedCampaignRepo.list(ctx));
        const withCounts = await withTenantTx(identity, (ctx) =>
          Promise.all(
            campaigns.slice(0, 30).map(async (c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              category: (c.discoveryQuery as { category?: string } | null)?.category ?? null,
              location: (c.discoveryQuery as { location?: { text?: string } } | null)?.location?.text ?? null,
              aiDiscoveryEnabled: c.aiDiscoveryEnabled,
              lastDiscoveryRunAt: c.lastDiscoveryRunAt,
              errorReason: c.errorReason,
              leadsFound: await automatedLeadRepo.count(ctx, c.id, {}),
            })),
          ),
        );
        return { campaigns: withCounts };
      },
    }),

    update_campaign: tool({
      description:
        "Updates one or more fields on an EXISTING automated outreach campaign (name, category/location, " +
        "signature, maxLeadsPerRun, replyPollingEnabled, aiDiscoveryEnabled, styleExamples, marketResearch) — " +
        "call list_campaigns first to get the id. Works on a draft OR an already-active campaign (e.g. turning " +
        "on aiDiscoveryEnabled for a campaign that's been finding zero leads). Only pass the fields the user " +
        "actually wants changed; omitted fields keep their current value.",
      inputSchema: z.object({
        campaignId: z.string(),
        name: z.string().min(1).max(200).optional(),
        category: z.enum(CAMPAIGN_CATEGORIES).optional(),
        location: z.string().max(200).optional(),
        maxLeadsPerRun: z.number().int().min(1).max(100).optional(),
        signatureName: z.string().min(1).max(200).optional(),
        signatureTitle: z.string().max(200).optional(),
        signatureClosing: z.string().max(100).optional(),
        marketResearch: z.string().max(4000).optional(),
        replyPollingEnabled: z.boolean().optional(),
        aiDiscoveryEnabled: z.boolean().optional(),
      }),
      execute: async (input) => {
        const { campaignId, category, location, ...rest } = input;
        const row = await withTenantTx(identity, async (ctx) => {
          // discoveryQuery is one complete {category, location} unit in the
          // schema, not two independent fields — sending just one half
          // (e.g. only a new category) would silently write a broken
          // {category, location: {text: undefined}} shape into the DB. If
          // only one of the two changed, fetch the campaign's CURRENT
          // discoveryQuery first and merge, so a partial edit never
          // corrupts the other half.
          let discoveryQuery: { category: string; location: { text: string } } | undefined;
          if (category || location) {
            const existing = await automatedOutreachService.getCampaign(ctx, campaignId);
            const existingQuery = existing.discoveryQuery as { category: string; location?: { text?: string } };
            discoveryQuery = {
              category: category ?? existingQuery.category,
              location: { text: location ?? existingQuery.location?.text ?? "" },
            };
          }
          return automatedOutreachService.updateCampaign(ctx, campaignId, { ...rest, discoveryQuery });
        });
        return { id: row.id, name: row.name, status: row.status };
      },
    }),

    pause_campaign: tool({
      description:
        "Pauses an ACTIVE automated outreach campaign — stops discovery and sending until resumed with " +
        "activate_campaign. Not sensitive/destructive (nothing is lost, easily reversible) — no confirmation " +
        "needed beyond the user asking for it.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => automatedOutreachService.pauseCampaign(ctx, input.campaignId));
        return { id: row.id, status: row.status };
      },
    }),

    delete_campaign: tool({
      description:
        "PERMANENTLY deletes an automated outreach campaign and its leads/history — cannot be undone. " +
        "SENSITIVE: describe exactly which campaign (name) you're about to delete and wait for the user's " +
        "explicit yes in their next message before calling this — same rule as activate_campaign, never chain " +
        "straight from the request to the delete in one turn.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        const result = await withTenantTx(identity, (ctx) => automatedOutreachService.deleteCampaign(ctx, input.campaignId));
        return { id: result.id, deleted: true };
      },
    }),

    update_blueprint: tool({
      description:
        "Updates simple fields on an existing blueprint — name, websiteUrl, or status (draft/active/archived). " +
        "For revising the blueprint's actual CONTENT (offer, target customer, differentiator, etc.), use " +
        "generate_blueprint again instead — this tool only touches the fields listed, not the generated sections.",
      inputSchema: z.object({
        blueprintId: z.string(),
        name: z.string().min(1).max(200).optional(),
        websiteUrl: z.string().max(2000).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
      }),
      execute: async (input) => {
        const { blueprintId, ...rest } = input;
        const row = await withTenantTx(identity, (ctx) => blueprintService.update(ctx, blueprintId, rest));
        return { id: row.id, name: row.name, status: row.status };
      },
    }),

    delete_blueprint: tool({
      description:
        "PERMANENTLY deletes a blueprint — cannot be undone, and fails if any campaign still uses it (tell the " +
        "user to delete or reassign those campaigns first if that happens). SENSITIVE: describe which blueprint " +
        "(name) you're about to delete and wait for the user's explicit yes in their next message first.",
      inputSchema: z.object({ blueprintId: z.string() }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) => blueprintService.remove(ctx, input.blueprintId));
        return { id: input.blueprintId, deleted: true };
      },
    }),

    get_candidate: tool({
      description: "Gets one candidate's full profile by id (from a search_candidates result) — skills, experience, contact info, summary.",
      inputSchema: z.object({ candidateId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => candidateService.get(ctx, input.candidateId));
        return row;
      },
    }),

    update_candidate: tool({
      description:
        "Updates fields on an existing candidate's profile (name, contact info, location, title, years of " +
        "experience, skills, certifications, summary) — get the candidateId from search_candidates or " +
        "get_candidate first. Only pass fields the user wants changed.",
      inputSchema: z.object({
        candidateId: z.string(),
        fullName: z.string().min(1).max(200).optional(),
        emails: z.array(z.string().max(320)).max(20).optional(),
        phones: z.array(z.string().max(40)).max(20).optional(),
        location: z.string().max(200).optional(),
        currentTitle: z.string().max(200).optional(),
        yearsExperience: z.number().min(0).max(80).optional(),
        skills: z.array(z.string().max(80)).max(200).optional(),
        certifications: z.array(z.string().max(120)).max(100).optional(),
        summary: z.string().max(10000).optional(),
      }),
      execute: async (input) => {
        const { candidateId, ...rest } = input;
        const row = await withTenantTx(identity, (ctx) => candidateService.update(ctx, candidateId, rest));
        return { id: row.id, fullName: row.fullName };
      },
    }),

    delete_candidate: tool({
      description:
        "PERMANENTLY deletes a candidate's profile — cannot be undone. SENSITIVE: confirm which candidate " +
        "(name) you're about to delete and wait for the user's explicit yes in their next message first.",
      inputSchema: z.object({ candidateId: z.string() }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) => candidateService.remove(ctx, input.candidateId));
        return { id: input.candidateId, deleted: true };
      },
    }),

    list_shortlists: tool({
      description: "Lists this workspace's shortlists (saved groups of candidates).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await withTenantTx(identity, (ctx) => shortlistRepo.getByTenant(ctx));
        return { shortlists: rows };
      },
    }),

    create_shortlist: tool({
      description: "Creates a new, empty shortlist with the given name — add candidates to it with add_to_shortlist.",
      inputSchema: z.object({ name: z.string().min(1).max(200) }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => shortlistRepo.create(ctx, input.name));
        return { id: row.id, name: row.name };
      },
    }),

    add_to_shortlist: tool({
      description:
        "Adds a candidate (from search_candidates or get_candidate) to an existing shortlist (from " +
        "list_shortlists or create_shortlist). Not sensitive — no confirmation needed.",
      inputSchema: z.object({ shortlistId: z.string(), candidateId: z.string() }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) => shortlistRepo.addItem(ctx, input.shortlistId, input.candidateId));
        return { added: true };
      },
    }),

    list_reply_drafts: tool({
      description:
        "Lists AI-drafted replies awaiting human review for automated outreach campaigns — each one is a " +
        "response to a real lead who replied, drafted but NOT sent until approved. Use when the user asks " +
        "about pending replies or wants to review/approve/reject them.",
      inputSchema: z.object({}),
      execute: async () => {
        const drafts = await withTenantTx(identity, (ctx) => automatedOutreachService.listPendingReplyDrafts(ctx, {}));
        return { drafts };
      },
    }),

    approve_reply_draft: tool({
      description:
        "Sends an AI-drafted reply to the real lead who wrote in — this is the SENSITIVE, real-world-effect " +
        "step, same treatment as activate_campaign. Show the user the draft's full text (call list_reply_drafts " +
        "or get it from context first) and wait for their explicit yes in their next message before calling " +
        "this. Optionally pass finalBody to send an edited version instead of the AI's original draft.",
      inputSchema: z.object({ draftId: z.string(), finalBody: z.string().max(10000).optional() }),
      execute: async (input) => {
        const { result, afterCommit } = await withTenantTx(identity, (ctx) =>
          automatedOutreachService.approveReplyDraft(ctx, input.draftId, input.finalBody),
        );
        // Same "only send after the approval itself has actually
        // committed" ordering as activate_campaign — the real email send
        // lives in afterCommit precisely so a mid-transaction failure can
        // never leave a draft marked "approved" with no email sent, or
        // vice versa.
        await afterCommit();
        return { id: result.id, status: result.status };
      },
    }),

    reject_reply_draft: tool({
      description: "Discards an AI-drafted reply without sending it — not sensitive, no confirmation needed.",
      inputSchema: z.object({ draftId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => automatedOutreachService.rejectReplyDraft(ctx, input.draftId));
        return { id: row.id, status: row.status };
      },
    }),

    list_team: tool({
      description: "Lists this workspace's team members and their roles.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await withTenantTx(identity, (ctx) => teamService.list(ctx));
        return { team: rows };
      },
    }),

    invite_team_member: tool({
      description:
        "Invites a new team member by email with a given role (admin/recruiter/viewer — ask which if unsure, " +
        "default to recruiter for most cases; a workspace has exactly one owner, set at signup, so 'owner' " +
        "isn't an invitable role here). SENSITIVE: this sends a real invite email and grants real workspace " +
        "access — confirm the email and role with the user and wait for their explicit yes before calling this.",
      inputSchema: z.object({
        email: z.string().max(320),
        role: z.enum(["admin", "recruiter", "viewer"]),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => teamService.invite(ctx, input));
        return { id: row.id, email: row.email, role: row.role };
      },
    }),

    get_billing_info: tool({
      description:
        "Gets this workspace's current plan, seat count/limit, subscription status, and which capabilities " +
        "it includes (e.g. ai_agent, automated_outreach) — check this before answering plan questions or " +
        "suggesting an upgrade, rather than guessing what they're already on.",
      inputSchema: z.object({}),
      execute: async () => {
        const [tenant, sub, capabilities] = await withTenantTx(identity, async (ctx) => [
          await tenantRepo.getByIdAdmin(ctx.tenantId),
          await subscriptionRepo.getByTenant(ctx),
          await billingService.capabilities(ctx),
        ]);
        return {
          plan: tenant?.plan ?? "starter",
          seatLimit: tenant?.seatLimit ?? 1,
          subscriptionStatus: sub?.status ?? "none",
          renewsAt: sub?.renewsAt ?? null,
          capabilities,
        };
      },
    }),

    get_upgrade_link: tool({
      description:
        "Returns a real Stripe checkout link to upgrade (or add seats to) this workspace's plan — you cannot " +
        "complete a payment yourself, only generate the link for the user to click, same pattern as " +
        "connect_app's connection links. Only self-serve UPGRADES are supported (moving to a smaller plan or " +
        "fewer seats than currently subscribed fails with a clear error — tell the user to contact support " +
        "for that instead of retrying). Call get_billing_info first if you don't already know their current " +
        "plan/seats in this conversation.",
      inputSchema: z.object({
        plan: z.enum(["starter", "growth", "scale"]),
        seats: z.number().int().min(1).max(1000),
        billingCycle: z.enum(["monthly", "annual"]).optional().describe("Default 'monthly'"),
      }),
      execute: async (input) => {
        const { url } = await withTenantTx(identity, (ctx) =>
          billingService.createCheckout(ctx, input, appOrigin),
        );
        return { url };
      },
    }),

    send_email: tool({
      description:
        "Sends ONE standalone email right now from a connected sender account (Gmail or SMTP) — NOT part of " +
        "any campaign or sequence, just a single one-off message (e.g. 'email this lead directly' or 'send a " +
        "quick note to X'). Call list_sender_accounts first for a valid senderAccountId. For anything that's " +
        "really a campaign (multiple recipients, a sequence, tracked replies), use create_campaign or " +
        "create_bulkfire_campaign instead — this tool does none of that bookkeeping. SENSITIVE: same treatment " +
        "as activate_campaign — state the recipient, subject, and body you're about to send and wait for the " +
        "user's explicit yes in their next message before calling this.",
      inputSchema: z.object({
        senderAccountId: z.string(),
        to: z.string().max(320),
        subject: z.string().min(1).max(500),
        body: z.string().min(1).max(20000),
      }),
      execute: async (input) => {
        const sender = await withTenantTx(identity, (ctx) => senderAccountRepo.getById(ctx, input.senderAccountId));
        if (!sender) return { error: "Sender account not found." };
        const creds = toCredentials(sender);
        const result = await getServices().outreachMailer.send(creds, {
          from: sender.email,
          fromName: sender.fromName ?? undefined,
          to: input.to,
          subject: input.subject,
          text: input.body,
          replyTo: sender.email,
          messageId: generateMessageId(sender.email),
        });
        return { sent: true, to: input.to, subject: input.subject, gmailThreadId: result.gmailThreadId };
      },
    }),

    list_bulkfire_campaigns: tool({
      description:
        "Lists this workspace's Bulk Fire campaigns (the bring-your-own-list outreach system — separate from " +
        "Automated Outreach's discovery-based campaigns, see create_campaign vs this one) with their status.",
      inputSchema: z.object({}),
      execute: async () => {
        const campaigns = await withTenantTx(identity, (ctx) => outreachService.listCampaigns(ctx));
        return { campaigns };
      },
    }),

    create_bulkfire_campaign: tool({
      description:
        "Creates a new Bulk Fire campaign shell (name only) — starts completely empty. After creating it, the " +
        "user still needs to: import their own lead list (a CSV/DOCX upload — you can't do this part, tell them " +
        "to use the Bulk Fire page's upload button), set_bulkfire_sequence for the email copy, and " +
        "set_bulkfire_senders before it can be fired. This is the manual bring-your-own-list system — for AI-" +
        "discovered leads, use create_campaign (Automated Outreach) instead.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        channel: z.enum(["email", "whatsapp"]).optional().describe("Default 'email'"),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          outreachService.createCampaign(ctx, { name: input.name, channel: input.channel ?? "email" }),
        );
        return { id: row.id, name: row.name, status: row.status, url: `/outreach/bulk-fire/${row.id}` };
      },
    }),

    set_bulkfire_sequence: tool({
      description:
        "Sets the email sequence for a Bulk Fire campaign — up to 3 steps (day 0 opener, plus optional " +
        "follow-ups), each with its own subject/body template and day offset from the previous step. Replaces " +
        "the whole sequence, not a single step — pass every step you want kept. Ask the user for the subject " +
        "and body of each step; don't invent marketing copy they didn't give you.",
      inputSchema: z.object({
        campaignId: z.string(),
        steps: z
          .array(
            z.object({
              stepIndex: z.number().int().min(0).max(2),
              dayOffset: z.number().int().min(0).max(90).describe("Days after the previous step; 0 for the first step"),
              subject: z.string().min(1).max(500),
              body: z.string().min(1).max(10000),
            }),
          )
          .max(3),
      }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) =>
          outreachService.setSequence(ctx, input.campaignId, {
            sequence: input.steps.map((s) => ({
              stepIndex: s.stepIndex,
              dayOffset: s.dayOffset,
              subjectTemplate: s.subject,
              bodyTemplate: s.body,
            })),
          }),
        );
        return { campaignId: input.campaignId, stepsSet: input.steps.length };
      },
    }),

    set_bulkfire_senders: tool({
      description:
        "Assigns which connected sender accounts a Bulk Fire campaign sends from (call list_sender_accounts " +
        "first for valid ids) — volume rotates across all of them. An empty list falls back to every active " +
        "sender account automatically.",
      inputSchema: z.object({ campaignId: z.string(), senderAccountIds: z.array(z.string()).max(20) }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) =>
          outreachService.setCampaignSenders(ctx, input.campaignId, { senderAccountIds: input.senderAccountIds }),
        );
        return { campaignId: input.campaignId, senderCount: input.senderAccountIds.length };
      },
    }),

    list_bulkfire_leads: tool({
      description: "Lists the leads imported into a Bulk Fire campaign and their send status.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        const result = await withTenantTx(identity, (ctx) => outreachService.listLeads(ctx, input.campaignId, { limit: 50 }));
        return result;
      },
    }),

    fire_bulkfire_campaign: tool({
      description:
        "Sends step N of a Bulk Fire campaign's sequence to its eligible leads RIGHT NOW — this is the " +
        "SENSITIVE, real-world-effect step, same treatment as activate_campaign/approve_reply_draft: state " +
        "which campaign, which step, and roughly how many leads (call list_bulkfire_leads first if unsure) " +
        "before calling this, and wait for the user's explicit yes in their next message. Requires the " +
        "campaign to already have a sequence, senders, and imported leads — if any of those are missing this " +
        "will fail with a clear reason.",
      inputSchema: z.object({
        campaignId: z.string(),
        stepIndex: z.number().int().min(0).max(2).optional().describe("Default 0 (the first/opening step)"),
        cascadeFollowups: z
          .boolean()
          .optional()
          .describe("Step 0 only: also auto-schedule the later steps at their day offsets, in the same thread"),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          outreachService.fireCampaign(ctx, input.campaignId, input.stepIndex ?? 0, undefined, {
            cascadeFollowups: input.cascadeFollowups,
          }),
        );
        return row;
      },
    }),

    pause_bulkfire_campaign: tool({
      description: "Pauses a running Bulk Fire campaign — reversible with resume_bulkfire_campaign, no confirmation needed.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => outreachService.pauseCampaign(ctx, input.campaignId));
        return row;
      },
    }),

    resume_bulkfire_campaign: tool({
      description: "Resumes a paused Bulk Fire campaign — not sensitive, no confirmation needed.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => outreachService.resumeCampaign(ctx, input.campaignId));
        return row;
      },
    }),

    stop_bulkfire_campaign: tool({
      description:
        "PERMANENTLY stops a Bulk Fire campaign — marks it completed and cancels every not-yet-sent scheduled " +
        "email. Cannot be resumed afterward (unlike pause). SENSITIVE: same treatment as delete_campaign — " +
        "confirm which campaign and wait for the user's explicit yes first.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => outreachService.stopCampaign(ctx, input.campaignId));
        return row;
      },
    }),

    delete_bulkfire_campaign: tool({
      description:
        "PERMANENTLY deletes a Bulk Fire campaign and its lead/send history — cannot be undone. SENSITIVE: " +
        "confirm which campaign (name) and wait for the user's explicit yes in their next message first.",
      inputSchema: z.object({ campaignId: z.string() }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) => outreachService.deleteCampaign(ctx, input.campaignId));
        return { id: input.campaignId, deleted: true };
      },
    }),

    list_whatsapp_templates: tool({
      description:
        "Lists this workspace's WhatsApp Business message templates and their approval status (pending/" +
        "approved/rejected) — only approved templates can be used in set_bulkfire_whatsapp_sequence, Meta " +
        "forbids free-text WhatsApp messages for business-initiated conversations.",
      inputSchema: z.object({}),
      execute: async () => {
        const templates = await withTenantTx(identity, (ctx) => outreachService.listWhatsAppTemplates(ctx));
        return { templates };
      },
    }),

    submit_whatsapp_template: tool({
      description:
        "Submits a new WhatsApp message template to Meta for approval — this only records the submission " +
        "(status starts 'pending'); Meta's own review decides approval asynchronously, sometime later, not " +
        "instantly. Not sensitive/irreversible in itself (no message is sent to any end user by this call) — " +
        "no confirmation needed beyond the user asking for it. bodyText can include {{1}}, {{2}}, etc. as " +
        "placeholders filled in per-recipient later.",
      inputSchema: z.object({
        senderAccountId: z.string().describe("Must be a WhatsApp-type sender — see list_sender_accounts"),
        metaTemplateName: z
          .string()
          .max(512)
          .describe("Lowercase letters, digits, underscores only, e.g. 'weekly_followup_v1'"),
        category: z.enum(["marketing", "utility", "authentication"]),
        language: z.string().min(2).max(10).optional().describe("Default 'en_US'"),
        bodyText: z.string().min(1).max(1024),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          outreachService.submitWhatsAppTemplate(ctx, {
            senderAccountId: input.senderAccountId,
            metaTemplateName: input.metaTemplateName,
            category: input.category,
            language: input.language ?? "en_US",
            bodyText: input.bodyText,
          }),
        );
        return { id: row.id, metaTemplateName: row.metaTemplateName, status: row.status };
      },
    }),

    set_bulkfire_whatsapp_sequence: tool({
      description:
        "Sets the WhatsApp message sequence for a WhatsApp-channel Bulk Fire campaign (create it with " +
        "create_bulkfire_campaign's channel:'whatsapp') — up to 3 steps, each using an APPROVED template (see " +
        "list_whatsapp_templates) plus its {{n}} placeholder values, not free text. Use set_bulkfire_sequence " +
        "instead for an email-channel campaign.",
      inputSchema: z.object({
        campaignId: z.string(),
        steps: z
          .array(
            z.object({
              stepIndex: z.number().int().min(0).max(2),
              dayOffset: z.number().int().min(0).max(90),
              templateId: z.string(),
              templateParams: z.array(z.string().max(500)).max(10).optional().describe("Fills {{1}}, {{2}}, etc. in order"),
            }),
          )
          .max(3),
      }),
      execute: async (input) => {
        await withTenantTx(identity, (ctx) =>
          outreachService.setWhatsAppSequence(ctx, input.campaignId, {
            sequence: input.steps.map((s) => ({
              stepIndex: s.stepIndex,
              dayOffset: s.dayOffset,
              templateId: s.templateId,
              templateParams: s.templateParams ?? [],
            })),
          }),
        );
        return { campaignId: input.campaignId, stepsSet: input.steps.length };
      },
    }),

    save_skill: tool({
      description:
        "Saves a reusable 'skill' — a named procedure the user can invoke by name in ANY future conversation " +
        "without re-explaining it, e.g. 'run my weekly follow-up skill'. Use this when the user asks to save, " +
        "remember, or turn what you just did into a reusable skill. Before calling this, summarize back to the " +
        "user the name, one-line description, and the instructions you're about to save, and get their " +
        "confirmation or edits — never save silently without them seeing what's being saved. `instructions` " +
        "should be a clear, complete, standalone procedure (written so a future conversation with NO other " +
        "context could follow it) — include which tools to use and in what order, and use {placeholders} for " +
        "whatever should vary each time it's run (e.g. 'search_candidates for {role} in {location}').",
      inputSchema: z.object({
        name: z.string().min(1).max(100),
        description: z.string().min(1).max(500).describe("One line — this is what future-you sees when deciding whether to use it"),
        instructions: z.string().min(1).max(8000),
      }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) =>
          agentSkillsService.create(ctx, {
            name: input.name,
            description: input.description,
            instructions: input.instructions,
          }),
        );
        return { id: row.id, name: row.name, url: "/agent/skills" };
      },
    }),

    use_skill: tool({
      description:
        "Loads the full instructions for one of this workspace's saved skills by exact name (see the 'Saved " +
        "skills' list in your instructions for the names/descriptions already available — call this once " +
        "you've identified which one applies) and follow them as the procedure for the rest of this turn, " +
        "filling in any {placeholder} from what the user told you or asking for whatever's missing.",
      inputSchema: z.object({ name: z.string().max(100) }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => agentSkillRepo.getByName(ctx, input.name));
        if (!row) return { error: `No skill named "${input.name}" found.` };
        await withTenantTx(identity, (ctx) => agentSkillRepo.recordUsage(ctx, row.id));
        return { name: row.name, instructions: row.instructions };
      },
    }),

    schedule_task: tool({
      description:
        "Schedules an instruction to run automatically in the background, either recurring (hourly/daily/" +
        "weekly) or once at a specific future time — e.g. 'check for new replies every morning' or 'activate " +
        "this campaign tomorrow at 9am'. The instruction runs with the same tools you have now, in a headless " +
        "copy of THIS conversation, and its result gets posted back into this same chat so the user can review " +
        "it later. Write `instruction` as a complete, standalone request — it will be read with no other " +
        "context. Confirm the exact schedule/time and what it will do with the user before calling this. For a " +
        "one-off `runAt`, the user's plain-language time (e.g. 'tomorrow at 9am') has no timezone on its own — " +
        "if they haven't told you their timezone anywhere in this conversation, ask before converting to an " +
        "ISO datetime, don't silently assume UTC (a 'daily' or 'hourly' schedule has no such ambiguity — it's " +
        "always relative to whenever this is created, not a specific clock time).",
      inputSchema: z.object({
        instruction: z.string().min(1).max(4000),
        schedule: z.enum(["hourly", "daily", "weekly"]).optional().describe("For a recurring task"),
        runAt: z
          .string()
          .optional()
          .describe("Full ISO datetime WITH timezone offset for a one-off task, e.g. '2026-08-10T09:00:00-05:00' or '...Z' for UTC"),
      }),
      execute: async (input) => {
        if (!input.schedule && !input.runAt) {
          return { error: "Provide either a recurring schedule or a specific one-off run time." };
        }
        const task = await withTenantTx(identity, (ctx) =>
          agentTasksService.create(ctx, {
            conversationId: identity.conversationId,
            instruction: input.instruction,
            schedule: input.schedule,
            runAt: input.runAt,
          }),
        );
        return {
          id: task.id,
          schedule: task.schedule,
          nextRunAt: task.nextRunAt,
          url: "/agent/tasks",
        };
      },
    }),

    list_tasks: tool({
      description: "Lists this workspace's scheduled/background agent tasks and their status.",
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = await withTenantTx(identity, (ctx) => agentTaskRepo.list(ctx));
        return {
          tasks: tasks.slice(0, 50).map((t) => ({
            id: t.id,
            instruction: t.instruction,
            schedule: t.schedule,
            status: t.status,
            nextRunAt: t.nextRunAt,
            lastRunAt: t.lastRunAt,
            lastError: t.lastError,
          })),
        };
      },
    }),

    cancel_task: tool({
      description: "Pauses (stops running) a scheduled task by its id — call list_tasks first if you need the id.",
      inputSchema: z.object({ taskId: z.string() }),
      execute: async (input) => {
        const row = await withTenantTx(identity, (ctx) => agentTasksService.pause(ctx, input.taskId));
        return { id: row.id, status: row.status };
      },
    }),
  };
}
