import type { TenantContext } from "@/server/db/tx";
import { blueprintRepo } from "@/server/repositories/blueprint.repo";
import { automatedCampaignRepo } from "@/server/repositories/automated-outreach.repo";
import { getServices } from "@/server/container";
import { NotFound, Conflict, BadRequest } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";
import type {
  BlueprintSuggestions,
  BlueprintIntakeAnswers,
} from "@/server/ports";
import type {
  CreateBlueprintBody,
  UpdateBlueprintBody,
  SuggestBlueprintBody,
  IntakeAnswersBody,
} from "@/server/validation/blueprint";

/**
 * Blueprint business logic. CRUD is plain tenant-scoped repo work; the two
 * AI seams (suggest / generate) delegate to the Gemini-or-mock adapters wired
 * in container.ts. Both AI calls run synchronously within the request — the
 * guided wizard needs the result inline. They're bounded by the LLM endpoints'
 * rate limit (see the API routes). Website text is treated as untrusted data
 * inside the adapter, never here.
 */
export const blueprintService = {
  async list(ctx: TenantContext) {
    return await blueprintRepo.list(ctx);
  },

  async get(ctx: TenantContext, id: string) {
    const row = await blueprintRepo.getById(ctx, id);
    if (!row) throw new NotFound("Blueprint not found");
    return row;
  },

  async create(ctx: TenantContext, body: CreateBlueprintBody) {
    const existing = await blueprintRepo.findByName(ctx, body.name);
    if (existing) throw new Conflict("A blueprint with that name already exists");
    return await blueprintRepo.create(ctx, {
      name: body.name,
      websiteUrl: body.websiteUrl ?? null,
      intakeAnswers: body.intakeAnswers ?? null,
    });
  },

  async update(ctx: TenantContext, id: string, body: UpdateBlueprintBody) {
    // Ensure it exists (and is ours) before mutating — clean 404 vs. silent no-op.
    await blueprintService.get(ctx, id);
    if (body.name !== undefined) {
      const clash = await blueprintRepo.findByName(ctx, body.name);
      if (clash && clash.id !== id) {
        throw new Conflict("A blueprint with that name already exists");
      }
    }
    const row = await blueprintRepo.update(ctx, id, body);
    if (!row) throw new NotFound("Blueprint not found");
    return row;
  },

  async remove(ctx: TenantContext, id: string) {
    // Blueprint delete is a SOFT delete (deletedAt), which bypasses the
    // blueprintId FK's "no onDelete" protection entirely — a real DB delete
    // would be blocked by Postgres, but nothing stops this UPDATE. Any
    // campaign referencing this blueprint (any status — a "completed" one
    // still reads it for historical display) would silently start failing
    // to resolve it, since getById filters out soft-deleted rows.
    const linkedCampaigns = await automatedCampaignRepo.countByBlueprintId(ctx, id);
    if (linkedCampaigns > 0) {
      throw new Conflict(
        linkedCampaigns === 1
          ? "This blueprint is used by 1 automated campaign. Delete that campaign first."
          : `This blueprint is used by ${linkedCampaigns} automated campaigns. Delete those campaigns first.`,
      );
    }
    const row = await blueprintRepo.softDelete(ctx, id);
    if (!row) throw new NotFound("Blueprint not found");
    return { id: row.id };
  },

  /** Wizard Step 2: research a website and return suggested intake options.
   *  Stateless — does not persist anything. */
  async suggestFromWebsite(
    _ctx: TenantContext,
    body: SuggestBlueprintBody,
  ): Promise<BlueprintSuggestions> {
    return await getServices().blueprintResearcher.suggest({
      websiteUrl: body.websiteUrl,
      name: body.name,
    });
  },

  /** Wizard Step 3 / regenerate: turn confirmed answers into sections and
   *  persist them on the blueprint. `answersOverride` lets the wizard generate
   *  from freshly-confirmed answers before a separate PATCH. */
  async generate(
    ctx: TenantContext,
    id: string,
    answersOverride?: IntakeAnswersBody,
  ) {
    const row = await blueprintService.get(ctx, id);

    const stored = (row.intakeAnswers as BlueprintIntakeAnswers | null) ?? null;
    const merged: BlueprintIntakeAnswers = answersOverride
      ? {
          businessName: answersOverride.businessName ?? row.name,
          websiteUrl: answersOverride.websiteUrl ?? row.websiteUrl ?? undefined,
          answers: answersOverride.answers,
        }
      : {
          businessName: stored?.businessName ?? row.name,
          websiteUrl: stored?.websiteUrl ?? row.websiteUrl ?? undefined,
          answers: stored?.answers ?? {},
        };

    if (!merged.answers || Object.keys(merged.answers).length === 0) {
      throw new BadRequest(
        "Cannot generate a blueprint without intake answers — complete the wizard first",
      );
    }

    let sections;
    try {
      sections = await getServices().blueprintGenerator.generate(merged);
    } catch (err) {
      logger.error({ err, blueprintId: id }, "blueprint_generate_failed");
      throw new BadRequest("Blueprint generation failed — please try again");
    }

    const updated = await blueprintRepo.update(ctx, id, {
      sections,
      // Persist the answers we generated from so re-generate is reproducible.
      intakeAnswers: merged,
      // First successful generation promotes a draft to active; keep an
      // explicit archived status if the user set it.
      status: row.status === "archived" ? "archived" : "active",
    });
    if (!updated) throw new NotFound("Blueprint not found");
    return updated;
  },
};
