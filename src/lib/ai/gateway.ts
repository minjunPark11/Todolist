import type { AiChatRequest, AiChatResponse, AiProvider } from "./types";
import { ollamaProvider } from "./providers/ollamaProvider";
import { remoteOllamaProvider } from "./providers/remoteOllamaProvider";

const providers: AiProvider[] = [ollamaProvider, remoteOllamaProvider];

export async function sendAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const errors: string[] = [];

  for (const provider of providers) {
    try {
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
      "Run local Ollama, or configure remote Ollama fallback.",
      errors.length ? `Details: ${errors.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}
