// Managed local AI provider (LOCAL_AI_SYSTEM_DESIGN.md §7 Phase 4): talks
// OpenAI-compatible /v1/chat/completions to the llama-server that
// ensureAiReady() prepares — spawning the sidecar on demand in managed mode,
// or just health-checking the user's own OpenAI-compatible server (LM Studio,
// LocalAI, …) in external mode.
import { ensureAiReady } from "../../localAi/runtime";
import { loadLocalAiSettings } from "../../localAi/settings";
import { platform } from "../../../platform";
import type { AiChatRequest, AiChatResponse, AiMessage, AiProvider } from "../types";

type OpenAiChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string } | string;
};

function isLocalHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

// Managed mode always binds to 127.0.0.1; external mode is local only when
// the user's URL points at this machine. Full app data and Obsidian-derived
// context never leave the device (KNOWLEDGE_BASE_DESIGN.md principles 9-10).
function isLocalEndpoint(): boolean {
  const settings = loadLocalAiSettings();
  if (settings.launchMode !== "external") return true;
  try {
    return isLocalHostname(new URL(settings.externalServerUrl).hostname);
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

function errorMessageOf(data: OpenAiChatResponse | null): string | undefined {
  if (!data?.error) return undefined;
  return typeof data.error === "string" ? data.error : data.error.message;
}

// The reason the last isAvailable() call failed, so the gateway can surface an
// actionable message (e.g. "install the engine") instead of a generic error
// when it falls through to an unconfigured server provider.
let lastUnavailableMessage: string | null = null;

export const llamaServerProvider: AiProvider = {
  name: "llama-server",

  canHandleFullAppData() {
    return isLocalEndpoint();
  },

  canHandleKnowledgeContext() {
    return isLocalEndpoint();
  },

  // May take a while on first use in managed mode: ensureAiReady() spawns the
  // sidecar and waits for the model to load. That is the intended on-demand
  // launch flow, not an accident.
  async isAvailable() {
    const result = await ensureAiReady(loadLocalAiSettings());
    lastUnavailableMessage = result.ok ? null : result.message;
    return result.ok;
  },

  unavailableMessage() {
    return lastUnavailableMessage;
  },

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const settings = loadLocalAiSettings();
    const ready = await ensureAiReady(settings);
    if (!ready.ok) {
      throw new Error(ready.message);
    }

    // llama-server serves whatever model it loaded regardless of this field,
    // but external OpenAI-compatible servers may route on it.
    const model = request.model?.trim() || settings.selectedModelId || "local";

    const response = await platform.aiFetch(`${ready.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: request.temperature ?? 0.2,
        messages: withKnowledgeContext(request.messages, request.knowledgeContext),
      }),
    });

    const data = (await response.json().catch(() => null)) as OpenAiChatResponse | null;
    if (!response.ok) {
      throw new Error(errorMessageOf(data) ?? `Local AI request failed with status ${response.status}.`);
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Local AI returned an empty response.");
    }

    return {
      content,
      provider: "llama-server",
      model: data?.model ?? model,
      raw: data,
    };
  },
};
