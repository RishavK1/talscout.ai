import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { withTenantTx } from "@/server/db/tx";
import { searchService } from "@/server/services/search.service";
import { blueprintService } from "@/server/services/blueprint.service";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { outreachService } from "@/server/services/outreach.service";
import { candidateRepo } from "@/server/repositories/candidate.repo";
import { shortlistRepo } from "@/server/repositories/shortlist.repo";
import { automatedSendRepo, automatedCampaignRepo, automatedLeadRepo } from "@/server/repositories/automated-outreach.repo";
import { outreachSendRepo } from "@/server/repositories/outreach.repo";
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
export function buildInHouseTools(identity: { tenantId: string; userId: string; conversationId: string }): ToolSet {
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
