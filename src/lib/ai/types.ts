import type { AgentIntent } from "./agent/intent";

export type AiProviderName = "llama-server" | "server";

export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string;
};

export type AiAppContext = {
  currentPage?: string;
  userId?: string;
  intent?: AgentIntent;
  summary?: string;
  calendarContextText?: string;
};

export type AiChatRequest = {
  messages: AiMessage[];
  context?: AiAppContext;
  temperature?: number;
  dataScope?: "compact" | "full-app";
  // Optional model override chosen by the user; falls back to provider default.
  model?: string;
  // Obsidian-derived excerpts (see KNOWLEDGE_BASE_DESIGN.md). Kept separate
  // from `messages` so the gateway can structurally strip it before falling
  // back to a provider that isn't a local endpoint (principles 9-10).
  knowledgeContext?: string;
};

export type AiChatResponse = {
  content: string;
  provider: AiProviderName;
  model?: string;
  raw?: unknown;
};

export type AiProvider = {
  name: AiProviderName;
  isAvailable: () => Promise<boolean>;
  canHandleFullAppData?: () => boolean;
  // True only when the provider's endpoint is on this machine. Gates
  // `AiChatRequest.knowledgeContext` (KNOWLEDGE_BASE_DESIGN.md principles
  // 9-10) — undefined/false means the gateway strips knowledgeContext before
  // this provider ever sees the request.
  canHandleKnowledgeContext?: () => boolean;
  chat: (request: AiChatRequest) => Promise<AiChatResponse>;
  // Lists the models installed on the provider, when it can be introspected.
  listModels?: () => Promise<string[]>;
  // A user-actionable reason the last isAvailable() returned false (e.g. "the
  // engine isn't installed — install it in Settings"), or null when available
  // or the reason isn't actionable. The gateway surfaces it so a fallthrough to
  // an unconfigured provider doesn't bury the real fix behind a generic error.
  unavailableMessage?: () => string | null;
};
