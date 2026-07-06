import type { AiChatRequest, AiChatResponse, AiProvider } from "../types";
import { platform } from "../../../platform";

const DEFAULT_REMOTE_OLLAMA_MODEL = "gemma3";

type OllamaChatResponse = {
  model?: string;
  message?: {
    content?: string;
  };
  error?: string;
};

function isRemoteOllamaEnabled() {
  return (import.meta.env.VITE_REMOTE_OLLAMA_ENABLED as string | undefined)?.trim() === "true";
}

function getRemoteOllamaBaseUrl() {
  const configured = import.meta.env.VITE_REMOTE_OLLAMA_URL as string | undefined;
  return (configured?.trim() ?? "").replace(/\/$/, "");
}

function getRemoteOllamaModel() {
  const configured = import.meta.env.VITE_REMOTE_OLLAMA_MODEL as string | undefined;
  return configured?.trim() || DEFAULT_REMOTE_OLLAMA_MODEL;
}

function withTimeout(milliseconds: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), milliseconds);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}

export const remoteOllamaProvider: AiProvider = {
  name: "remote-ollama",

  async isAvailable() {
    if (!isRemoteOllamaEnabled()) return false;

    const baseUrl = getRemoteOllamaBaseUrl();
    if (!baseUrl) return false;

    const timeout = withTimeout(2500);
    try {
      const response = await platform.aiFetch(`${baseUrl}/api/tags`, {
        method: "GET",
        signal: timeout.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      timeout.clear();
    }
  },

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    if (!isRemoteOllamaEnabled()) {
      throw new Error("Remote Ollama fallback is disabled.");
    }

    const baseUrl = getRemoteOllamaBaseUrl();
    if (!baseUrl) {
      throw new Error("Remote Ollama URL is not configured.");
    }

    const model = request.model?.trim() || getRemoteOllamaModel();
    const response = await platform.aiFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.2,
        },
        messages: request.messages,
      }),
    });

    const data = (await response.json().catch(() => null)) as OllamaChatResponse | null;

    if (!response.ok) {
      throw new Error(data?.error ?? `Remote Ollama request failed with status ${response.status}.`);
    }

    const content = data?.message?.content?.trim();
    if (!content) {
      throw new Error("Remote Ollama returned an empty response.");
    }

    return {
      content,
      provider: "remote-ollama",
      model: data?.model ?? model,
      raw: data,
    };
  },
};
