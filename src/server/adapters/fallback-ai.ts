import { logger } from "@/server/observability/logger";
import type {
  BlueprintResearcher,
  BlueprintGenerator,
  BlueprintSuggestions,
  BlueprintIntakeAnswers,
  BlueprintSections,
  OutreachCopywriter,
  OutreachCopyRequest,
  OutreachCopyResult,
  ReplyDrafter,
  ReplyDraftRequest,
  ReplyDraftResult,
} from "@/server/ports";

/**
 * Thin "primary, then fallback" wrappers for the four Gemini-powered AI
 * writing ports — same decorator shape as fallback.lead-discovery.ts, one
 * class per port since each has a different single method to delegate.
 * Wired in container.ts ONLY when both a Gemini adapter and an OpenRouter
 * adapter are configured; the fallback is OpenRouter's free-model waterfall
 * (see openrouter.client.ts), reached only once Gemini's own primary+
 * fallback model both fail (e.g. daily quota exhausted).
 */

export class FallbackBlueprintResearcher implements BlueprintResearcher {
  constructor(
    private primary: BlueprintResearcher,
    private fallback: BlueprintResearcher,
  ) {}

  async suggest(args: { websiteUrl: string; name: string }): Promise<BlueprintSuggestions> {
    try {
      return await this.primary.suggest(args);
    } catch (err) {
      logger.warn({ err }, "blueprint_researcher_primary_failed_falling_back_to_openrouter");
      return this.fallback.suggest(args);
    }
  }
}

export class FallbackBlueprintGenerator implements BlueprintGenerator {
  constructor(
    private primary: BlueprintGenerator,
    private fallback: BlueprintGenerator,
  ) {}

  async generate(input: BlueprintIntakeAnswers): Promise<BlueprintSections> {
    try {
      return await this.primary.generate(input);
    } catch (err) {
      logger.warn({ err }, "blueprint_generator_primary_failed_falling_back_to_openrouter");
      return this.fallback.generate(input);
    }
  }
}

export class FallbackOutreachCopywriter implements OutreachCopywriter {
  constructor(
    private primary: OutreachCopywriter,
    private fallback: OutreachCopywriter,
  ) {}

  async generateEmail(input: OutreachCopyRequest): Promise<OutreachCopyResult> {
    try {
      return await this.primary.generateEmail(input);
    } catch (err) {
      logger.warn({ err }, "outreach_copywriter_primary_failed_falling_back_to_openrouter");
      return this.fallback.generateEmail(input);
    }
  }
}

export class FallbackReplyDrafter implements ReplyDrafter {
  constructor(
    private primary: ReplyDrafter,
    private fallback: ReplyDrafter,
  ) {}

  async draft(input: ReplyDraftRequest): Promise<ReplyDraftResult> {
    try {
      return await this.primary.draft(input);
    } catch (err) {
      logger.warn({ err }, "reply_drafter_primary_failed_falling_back_to_openrouter");
      return this.fallback.draft(input);
    }
  }
}
