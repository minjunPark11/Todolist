import type { AiChatRequest, AiChatResponse, AiProvider } from "./types";
import { ollamaProvider } from "./providers/ollamaProvider";
import { remoteOllamaProvider } from "./providers/remoteOllamaProvider";
import { serverProvider } from "./providers/serverProvider";

// Local-first provider order. Each provider owns its own availability check, so
// optional fallbacks stay inert unless their env configuration is present.
const providers: AiProvider[] = [ollamaProvider, remoteOllamaProvider, serverProvider];

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

      return await provider.chat(request);
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    [
      "AI provider is not available.",
      "Run local Ollama, configure remote Ollama fallback, or configure the server AI endpoint.",
      errors.length ? `Details: ${errors.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

// Lists models installed on the local Ollama instance. Returns an empty array
// when Ollama is offline or exposes no models, which the UI reads as "offline".
export async function listLocalAiModels(): Promise<string[]> {
  try {
    return (await ollamaProvider.listModels?.()) ?? [];
  } catch {
    return [];
  }
}
