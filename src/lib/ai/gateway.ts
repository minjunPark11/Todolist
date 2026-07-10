import type { AiChatRequest, AiChatResponse, AiProvider } from "./types";
import { llamaServerProvider } from "./providers/llamaServerProvider";
import { serverProvider } from "./providers/serverProvider";
import {
  LOCAL_AI_CONTEXT_TOKENS,
  RESPONSE_RESERVE_TOKENS,
  estimateTokens,
  fitMessagesToBudget,
} from "./promptBudget";

// Local-first provider order: the managed llama-server (or the user's own
// OpenAI-compatible server in external mode) leads, with the optional
// server-side endpoint as the only fallback. The Ollama-specific providers
// were removed in Phase 4 — connecting to a self-hosted server now goes
// through the external launch mode instead.
const providers: AiProvider[] = [llamaServerProvider, serverProvider];

// llama-server's message when the assembled prompt is larger than --ctx-size.
// We can't always predict it (the estimator is approximate and external
// servers vary), so we also recover reactively when we see it.
function isContextOverflowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeds the available context size|context size|n_ctx|too many tokens/i.test(message);
}

// The token budget left for the `messages` array after reserving room for the
// reply and for the knowledge block the provider injects separately.
function historyBudgetTokens(request: AiChatRequest): number {
  const knowledgeTokens = request.knowledgeContext ? estimateTokens(request.knowledgeContext) : 0;
  return LOCAL_AI_CONTEXT_TOKENS - RESPONSE_RESERVE_TOKENS - knowledgeTokens;
}

export async function sendAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const errors: string[] = [];

  // Proactive budgeting: trim the oldest history turns so system prompt +
  // app-data context + knowledge + history + reply all fit the 8192 window.
  // Both the chat and assistant flows funnel through here, so neither has to
  // compute the budget itself.
  const budgeted = fitMessagesToBudget(request.messages, historyBudgetTokens(request));
  const budgetedRequest: AiChatRequest = budgeted.dropped > 0 ? { ...request, messages: budgeted.messages } : request;

  for (const provider of providers) {
    try {
      if (request.dataScope === "full-app" && !provider.canHandleFullAppData?.()) {
        errors.push(`${provider.name}: full app data is restricted to local providers`);
        continue;
      }

      const available = await provider.isAvailable();
      if (!available) {
        errors.push(`${provider.name}: unavailable`);
        continue;
      }

      // Structural enforcement of KNOWLEDGE_BASE_DESIGN.md principles 9-10:
      // Obsidian-derived context never reaches a non-local provider.
      const outgoingRequest =
        budgetedRequest.knowledgeContext && !provider.canHandleKnowledgeContext?.()
          ? { ...budgetedRequest, knowledgeContext: undefined }
          : budgetedRequest;

      try {
        return await provider.chat(outgoingRequest);
      } catch (error) {
        // Reactive recovery: the estimate under-shot (or an external server
        // has a smaller window). Aggressively halve the remaining history and
        // retry once so the user never has to force-quit to clear the state.
        if (!isContextOverflowError(error)) throw error;
        const retried = fitMessagesToBudget(outgoingRequest.messages, historyBudgetTokens(outgoingRequest) / 2);
        if (retried.messages.length >= outgoingRequest.messages.length) throw error;
        return await provider.chat({ ...outgoingRequest, messages: retried.messages });
      }
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Prefer a provider's actionable setup hint (e.g. "install the engine") over
  // the generic message, so falling through to an unconfigured server provider
  // doesn't hide the real fix.
  const providerHint = providers.map((provider) => provider.unavailableMessage?.() ?? null).find(Boolean);
  const headline =
    providerHint ??
    "AI provider is not available. Set up Local AI in Settings (install a model), connect an external server, or configure the server AI endpoint.";

  throw new Error([headline, errors.length ? `Details: ${errors.join(" | ")}` : ""].filter(Boolean).join(" "));
}
