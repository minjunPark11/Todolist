import type { AiChatRequest, AiChatResponse, AiMessage, AiProvider } from "../types";
import { platform } from "../../../platform";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
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

// Inserts the knowledge block as a system message after any leading system
// messages (system prompt, app-data context) and before the chat turns, per
// KNOWLEDGE_BASE_DESIGN.md §6 priority order (system > app data > knowledge).
function withKnowledgeContext(messages: AiMessage[], knowledgeContext?: string): AiMessage[] {
  if (!knowledgeContext) return messages;
  const lastSystemIndex = messages.reduce((last, message, index) => (message.role === "system" ? index : last), -1);
  return [
    ...messages.slice(0, lastSystemIndex + 1),
    { role: "system" as const, content: knowledgeContext },
    ...messages.slice(lastSystemIndex + 1),
  ];
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

  canHandleKnowledgeContext() {
    return isLocalOllamaUrl();
  },

  async isAvailable() {
    const baseUrl = getOllamaBaseUrl();
    const timeout = withTimeout(1500);

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

  async listModels() {
    const baseUrl = getOllamaBaseUrl();
    const timeout = withTimeout(2500);

    try {
      const response = await platform.aiFetch(`${baseUrl}/api/tags`, {
        method: "GET",
        signal: timeout.signal,
      });
      if (!response.ok) return [];
      const data = (await response.json().catch(() => null)) as OllamaTagsResponse | null;
      return (data?.models ?? [])
        .map((entry) => entry.name ?? entry.model ?? "")
        .filter((name): name is string => name.length > 0);
    } catch {
      return [];
    } finally {
      timeout.clear();
    }
  },

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const baseUrl = getOllamaBaseUrl();
    const model = request.model?.trim() || getOllamaModel();

    const response = await platform.aiFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.2,
        },
        messages: withKnowledgeContext(request.messages, request.knowledgeContext),
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
