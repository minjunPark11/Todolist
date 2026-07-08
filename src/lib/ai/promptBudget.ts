// Client-side guard that keeps a chat request inside the local llama-server's
// context window (--ctx-size in src-tauri/src/local_ai.rs). The char-based
// budgets upstream (AI_CONTEXT_LIMITS, knowledgeBudgetChars) assume ~4 chars
// per token, which holds for English but not for Korean — Hangul tokenizes at
// roughly one token per character — so a request that looks fine in characters
// can still overflow the window. llama-server rejects such requests outright
// ("request exceeds the available context size"), which surfaced to users as
// "AI provider is not available" even though Local AI was fully set up.
import type { AiMessage } from "./types";

// Must match --ctx-size for the managed chat server in
// src-tauri/src/local_ai.rs.
export const LOCAL_AI_CONTEXT_TOKENS = 16384;

// Space left for the model's reply (prompt + generation share one window)
// plus chat-template overhead the client can't measure.
const RESPONSE_RESERVE_TOKENS = 2048;

export const PROMPT_TOKEN_BUDGET = LOCAL_AI_CONTEXT_TOKENS - RESPONSE_RESERVE_TOKENS;

// Role header + separators the chat template adds around each message.
const MESSAGE_OVERHEAD_TOKENS = 8;

// Below this the knowledge block is too mangled to help — drop it instead.
const MIN_USEFUL_BLOCK_TOKENS = 128;

const TRUNCATION_MARKER = "\n…(이하 생략)";

// Deliberate overestimate: ASCII runs at ~3.5-4 chars/token in BPE
// vocabularies, CJK/Hangul at ~1-1.5 chars/token. Overestimating trims a
// little more context than strictly needed; underestimating brings back the
// hard llama-server rejection, so lean high.
export function estimateTokens(text: string): number {
  let ascii = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 128) ascii += 1;
  }
  return Math.ceil(ascii / 3) + (text.length - ascii);
}

function estimateMessageTokens(message: AiMessage): number {
  return estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS;
}

function truncateToTokens(text: string, maxTokens: number): string {
  const allowance = maxTokens - estimateTokens(TRUNCATION_MARKER);
  if (allowance <= 0) return "";
  if (estimateTokens(text) <= maxTokens) return text;
  // Proportional first cut, then shrink until the estimate agrees.
  let keep = Math.floor((text.length * allowance) / estimateTokens(text));
  while (keep > 0 && estimateTokens(text.slice(0, keep)) > allowance) {
    keep = Math.floor(keep * 0.9);
  }
  return text.slice(0, keep) + TRUNCATION_MARKER;
}

export type FittedChatRequest = {
  messages: AiMessage[];
  knowledgeContext?: string;
};

// Trims a request until it fits the prompt budget, sacrificing the least
// important content first (KNOWLEDGE_BASE_DESIGN.md §6 priority order:
// system > app data > knowledge; knowledge "is an enhancement, never blocks
// the chat"):
//   1. the knowledge block only gets whatever budget the messages leave over;
//   2. then the oldest chat turns are dropped (system messages and the
//      current user turn always stay);
//   3. last resort, the largest remaining message — in practice the app-data
//      context — is truncated in place.
export function fitToContextWindow(
  messages: AiMessage[],
  knowledgeContext: string | undefined,
  budget: number = PROMPT_TOKEN_BUDGET,
): FittedChatRequest {
  const fitted = [...messages];
  const messagesTokens = () => fitted.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  let fittedKnowledge = knowledgeContext || undefined;
  const knowledgeTokens = () => (fittedKnowledge ? estimateTokens(fittedKnowledge) + MESSAGE_OVERHEAD_TOKENS : 0);

  if (messagesTokens() + knowledgeTokens() <= budget) {
    return { messages: fitted, knowledgeContext: fittedKnowledge };
  }

  if (fittedKnowledge) {
    const allowance = budget - messagesTokens() - MESSAGE_OVERHEAD_TOKENS;
    fittedKnowledge = allowance >= MIN_USEFUL_BLOCK_TOKENS ? truncateToTokens(fittedKnowledge, allowance) : undefined;
    if (messagesTokens() + knowledgeTokens() <= budget) {
      return { messages: fitted, knowledgeContext: fittedKnowledge };
    }
  }

  for (let index = 0; index < fitted.length - 1 && messagesTokens() > budget; ) {
    if (fitted[index].role === "system") {
      index += 1;
      continue;
    }
    fitted.splice(index, 1);
  }

  let guard = 0;
  while (messagesTokens() > budget && guard < 8) {
    guard += 1;
    let largestIndex = 0;
    for (let index = 1; index < fitted.length; index += 1) {
      if (fitted[index].content.length > fitted[largestIndex].content.length) largestIndex = index;
    }
    const allowance = estimateMessageTokens(fitted[largestIndex]) - (messagesTokens() - budget) - MESSAGE_OVERHEAD_TOKENS;
    fitted[largestIndex] = {
      ...fitted[largestIndex],
      content: truncateToTokens(fitted[largestIndex].content, Math.max(allowance, 0)),
    };
  }

  return { messages: fitted, knowledgeContext: fittedKnowledge };
}
