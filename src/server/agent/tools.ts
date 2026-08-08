import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { withTenantTx } from "@/server/db/tx";
import { searchService } from "@/server/services/search.service";
import { blueprintService } from "@/server/services/blueprint.service";
import { automatedOutreachService } from "@/server/services/automated-outreach.service";
import { candidateRepo } from "@/server/repositories/candidate.repo";
import { shortlistRepo } from "@/server/repositories/shortlist.repo";

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
export function buildInHouseTools(identity: { tenantId: string; userId: string }): ToolSet {
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
        "Get workspace-wide numbers: total candidates (and how many are ready vs. still processing), total " +
        "blueprints, automated-outreach campaigns (total and how many are currently active), and shortlists. " +
        "Use this whenever the user asks 'how many...', for totals/counts, or a general overview of the workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        return await withTenantTx(identity, async (ctx) => {
          const [totalCandidates, readyCandidates, processingCandidates, blueprints, campaigns, shortlistCount] =
            await Promise.all([
              candidateRepo.count(ctx),
              candidateRepo.count(ctx, { status: "ready" }),
              candidateRepo.count(ctx, { status: "processing" }),
              blueprintService.list(ctx),
              automatedOutreachService.listCampaigns(ctx),
              shortlistRepo.countByTenant(ctx),
            ]);
          return {
            candidates: { total: totalCandidates, ready: readyCandidates, processing: processingCandidates },
            blueprints: { total: blueprints.length },
            automatedCampaigns: {
              total: campaigns.length,
              active: campaigns.filter((c) => c.status === "active").length,
              paused: campaigns.filter((c) => c.status === "paused").length,
              draft: campaigns.filter((c) => c.status === "draft").length,
            },
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
        "Create a new blueprint (ideal-customer-profile document) for this workspace. Use when the user asks " +
        "to create, set up, or start a new blueprint. Ask the user for a name (and optionally a website URL) " +
        "first if they haven't given one.",
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
  };
}
