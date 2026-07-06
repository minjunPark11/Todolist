import type { AgentIntent } from "./agent/intent";

export type AiProviderName = "ollama" | "remote-ollama" | "server";

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
  chat: (request: AiChatRequest) => Promise<AiChatResponse>;
  // Lists the models installed on the provider, when it can be introspected.
  listModels?: () => Promise<string[]>;
};
