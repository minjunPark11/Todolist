import { sendAiChat } from "../gateway";
import type { AiChatResponse, AiMessage } from "../types";
import type { AgentAction } from "./actions";
import { detectAgentIntent, type AgentIntent } from "./intent";
import { PERSONAL_AGENT_SYSTEM_PROMPT } from "./prompts";

export type PersonalAgentRequest = {
  messages: AiMessage[];
  contextText?: string;
  intent?: AgentIntent;
};

export type PersonalAgentResponse = AiChatResponse & {
  intent: AgentIntent;
  suggestedActions: AgentAction[];
  needsConfirmation: boolean;
};

export async function runPersonalAgent({
  messages,
  contextText,
  intent,
}: PersonalAgentRequest): Promise<PersonalAgentResponse> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const resolvedIntent = intent ?? detectAgentIntent(lastUserMessage?.content ?? "");
  const response = await sendAiChat({
    dataScope: contextText ? "full-app" : "compact",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: PERSONAL_AGENT_SYSTEM_PROMPT,
      },
      ...(contextText
        ? [
            {
              role: "system" as const,
              content: contextText,
            },
          ]
        : []),
      ...messages,
    ],
  });

  return {
    ...response,
    content: response.content,
    intent: resolvedIntent,
    suggestedActions: [],
    needsConfirmation: false,
  };
}
