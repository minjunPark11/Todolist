import { platform } from "../../../platform";
import type { AiChatRequest, AiChatResponse, AiProvider } from "../types";

type ServerAiResponse = {
  content?: string;
  message?: string;
  model?: string;
};

function getServerUrl() {
  const configured = import.meta.env.VITE_AI_SERVER_URL as string | undefined;
  return configured?.trim() ?? "";
}

export const serverProvider: AiProvider = {
  name: "server",

  async isAvailable() {
    return Boolean(getServerUrl());
  },

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const serverUrl = getServerUrl();
    if (!serverUrl) {
      throw new Error("AI server URL is not configured.");
    }

    const response = await platform.aiFetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const data = (await response.json().catch(() => null)) as ServerAiResponse | null;

    if (!response.ok) {
      throw new Error(`Server AI request failed with status ${response.status}.`);
    }

    const content = (data?.content ?? data?.message ?? "").trim();
    if (!content) {
      throw new Error("Server AI returned an empty response.");
    }

    return {
      content,
      provider: "server",
      model: data?.model,
      raw: data,
    };
  },
};
