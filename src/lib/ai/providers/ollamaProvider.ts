import type { AiChatRequest, AiChatResponse, AiProvider } from "../types";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

function getOllamaBaseUrl() {
  const configured = import.meta.env.VITE_OLLAMA_URL as string | undefined;
  return (configured?.trim() || DEFAULT_OLLAMA_URL).replace(/\/$/, "");
}

function getOllamaModel() {
  const configured = import.meta.env.VITE_OLLAMA_MODEL as string | undefined;
  return configured?.trim() || DEFAULT_OLLAMA_MODEL;
}

function isLocalOllamaUrl() {
  try {
    const url = new URL(getOllamaBaseUrl());
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function withTimeout(milliseconds: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), milliseconds);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}

export const ollamaProvider: AiProvider = {
  name: "ollama",

  canHandleFullAppData() {
    return isLocalOllamaUrl();
  },

  async isAvailable() {
    const baseUrl = getOllamaBaseUrl();
    const timeout = withTimeout(1500);

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
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
    const baseUrl = getOllamaBaseUrl();
    const model = getOllamaModel();

    const response = await fetch(`${baseUrl}/api/chat`, {
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
      throw new Error(data?.error ?? `Ollama request failed with status ${response.status}.`);
    }

    const content = data?.message?.content?.trim();
    if (!content) {
      throw new Error("Ollama returned an empty response.");
    }

    return {
      content,
      provider: "ollama",
      model,
      raw: data,
    };
  },
};
