import { runPersonalAgent } from "./ai/agent/personalAgent";
import type { AiMessage } from "./ai/types";

export type OllamaChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function askOllamaChat(messages: OllamaChatMessage[], contextText?: string): Promise<string> {
  const response = await runPersonalAgent({
    messages: messages as AiMessage[],
    contextText,
  });
  return response.content;
}

export async function askOllama(prompt: string): Promise<string> {
  return askOllamaChat([{ role: "user", content: prompt }]);
}
