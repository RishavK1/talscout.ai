import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getEnv } from "@/server/config/env";

export interface AgentModelCandidate {
  model: LanguageModel;
  label: string;
}

/**
 * Fallback chain for the agent's reasoning/tool-calling loop: Gemini
 * (primary) -> OpenRouter free tier.
 *
 * You asked for Perplexity first, with "or manage accordingly, which you
 * should" — so here's the finding that changed the order. Live-tested all
 * three providers against a tool whose result is unguessable without
 * actually calling it (a made-up "secret code"), with real API keys, not a
 * hypothetical: Gemini and OpenRouter both called the tool and returned the
 * correct value. Perplexity's sonar-pro did NOT call the tool at all — it
 * replied "I can't provide a secret code from a hidden-code tool because no
 * such tool is available in this chat," despite the tool being present in
 * the request. That's not a transient failure this runner's per-turn
 * fallback can catch either: it's a "successful," on-topic text response
 * that just quietly never does what it was asked, which is a worse outcome
 * than an error for a feature whose entire premise is DOING things, not
 * describing them. Perplexity stays primary everywhere else in this app
 * (blueprint research, lead qualification, ...) where no tool-calling is
 * involved — this is specific to the agent's tool loop.
 *
 * Model picks:
 * - Gemini: whatever GEMINI_MODEL is already configured to (matches every
 *   other Gemini call in this app, no separate "agent model" env var).
 * - OpenRouter: a specific `:free` model, not the live-fetched list used
 *   for JSON-mode generation elsewhere, and verified (same live test) to
 *   actually call tools correctly — pinned rather than left to drift to
 *   whatever's newly free and unverified.
 */
export function getAgentModelChain(): AgentModelCandidate[] {
  const env = getEnv();
  const chain: AgentModelCandidate[] = [];

  if (env.GEMINI_API_KEY) {
    const google = createGoogle({ apiKey: env.GEMINI_API_KEY });
    chain.push({ model: google(env.GEMINI_MODEL), label: "Gemini" });
  }
  if (env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    chain.push({ model: openrouter("openai/gpt-oss-20b:free"), label: "OpenRouter" });
  }
  return chain;
}
