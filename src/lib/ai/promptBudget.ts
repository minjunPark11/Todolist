// Prompt token budgeting for the local llama-server (User Patterns / Unified
// Chat prerequisite; see docs). The managed sidecar runs with a fixed 8192
// context window (--ctx-size in src-tauri/src/local_ai.rs). Every request
// carries a big fixed cost — system prompt + trimmed app-data JSON + optional
// knowledge context — and a chat history that grows every turn. Nothing used
// to cap the SUM, so after a few turns the request overflowed the window and
// llama-server hard-failed ("request (N tokens) exceeds the available context
// size"); the only recovery was force-quitting the app (React state, and thus
// the oversized history, survived the error).
//
// These pure functions let the gateway keep the newest, most relevant turns
// and drop the oldest ones so the total always fits — a cache miss on the
// trimmed tail is vastly cheaper than a hard failure.
import type { AiMessage } from "./types";

// Matches --ctx-size in local_ai.rs. External OpenAI-compatible servers may
// offer more, but 8192 is a safe conservative floor to budget against.
export const LOCAL_AI_CONTEXT_TOKENS = 8192;
// Headroom the model needs to actually generate its reply within the same
// window. The assistant's JSON replies are the largest we produce.
export const RESPONSE_RESERVE_TOKENS = 1024;

// Rough, deliberately conservative token estimate — we would rather
// OVER-estimate (trim a little extra) than under-estimate and overflow again.
// CJK/Hangul syllables cost ~1 token each in the tokenizers these models use;
// latin-ish text is ~4 chars/token. Whitespace-only strings round to 0.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // Hangul (syllables + jamo) and CJK unified ideographs + common kana.
    if (
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(cjk + other * 0.28);
}

export function estimateMessageTokens(message: AiMessage): number {
  // ~4 tokens of per-message role/format overhead in the chat template.
  return estimateTokens(message.content) + 4;
}

export function estimateMessagesTokens(messages: AiMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

export type FitResult = {
  messages: AiMessage[];
  // How many messages were dropped from the middle (for logging/telemetry).
  dropped: number;
};

// Trims chat history to fit a token budget while preserving the two things
// that must never be dropped: the leading system messages (system prompt +
// app-data/context block — also the stable prompt-prefix the llama-server
// cache keys on) and the final message (the current user turn). Oldest
// non-system turns are dropped first.
//
// budgetTokens is what remains for the whole `messages` array after the
// caller subtracts the response reserve and any separate knowledge context.
export function fitMessagesToBudget(messages: AiMessage[], budgetTokens: number): FitResult {
  if (messages.length === 0) return { messages, dropped: 0 };

  // Leading system block: kept whole. The prompt prefix cache and the
  // app-data privacy/priority ordering both depend on it staying intact.
  let headEnd = 0;
  while (headEnd < messages.length && messages[headEnd].role === "system") headEnd += 1;
  const head = messages.slice(0, headEnd);
  const rest = messages.slice(headEnd);
  if (rest.length === 0) return { messages, dropped: 0 };

  // Final message (current turn) is always kept, even if it alone blows the
  // budget — there is nothing to answer without it, and the overflow-retry
  // path in the gateway is the last resort for that pathological case.
  const last = rest[rest.length - 1];
  const middle = rest.slice(0, -1);

  const fixed = estimateMessagesTokens(head) + estimateMessageTokens(last);
  let available = budgetTokens - fixed;

  // Walk the middle newest-first, keeping messages while they fit.
  const keptReversed: AiMessage[] = [];
  let dropped = 0;
  for (let i = middle.length - 1; i >= 0; i -= 1) {
    const cost = estimateMessageTokens(middle[i]);
    if (cost <= available) {
      keptReversed.push(middle[i]);
      available -= cost;
    } else {
      // Once one old turn doesn't fit, everything older is dropped too — we
      // never want a hole in the middle of the conversation.
      dropped = i + 1;
      break;
    }
  }

  const keptMiddle = keptReversed.reverse();
  return { messages: [...head, ...keptMiddle, last], dropped };
}
