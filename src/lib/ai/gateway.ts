import type { AiChatRequest, AiChatResponse, AiProvider } from "./types";
import { llamaServerProvider } from "./providers/llamaServerProvider";
import { serverProvider } from "./providers/serverProvider";

// Local-first provider order: the managed llama-server (or the user's own
// OpenAI-compatible server in external mode) leads, with the optional
// server-side endpoint as the only fallback. The Ollama-specific providers
// were removed in Phase 4 — connecting to a self-hosted server now goes
// through the external launch mode instead.
const providers: AiProvider[] = [llamaServerProvider, serverProvider];

export async function sendAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const errors: string[] = [];

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
        request.knowledgeContext && !provider.canHandleKnowledgeContext?.()
          ? { ...request, knowledgeContext: undefined }
          : request;

      return await provider.chat(outgoingRequest);
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
