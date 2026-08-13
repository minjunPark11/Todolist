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

// Fixed cost of the assistant's behavior contract, measured with the
// estimator above (~2.8k tokens). It is sent verbatim every turn and is the
// one block that can never be trimmed, so the variable blocks have to be
// budgeted around it:
//
//   8192 window - 2900 system prompt - 1024 reply reserve = ~4268 tokens
//   left to split between app context, knowledge, and chat history.
//
// The per-producer shares live with their own limits (AI_CONTEXT_LIMITS,
// ASSISTANT_CONTEXT_LIMITS); budgetsFitWindow() below is the assertion that
// they still add up.
export const ASSISTANT_SYSTEM_PROMPT_TOKENS = 2900;

const TRUNCATION_MARKER = "\n[context truncated]";

// Cut `text` to fit a TOKEN budget. Upstream caps used to be expressed in
// characters against a token-sized window, which silently assumed ~4 chars per
// token — true for latin text, but Hangul and CJK cost ~1 token per character,
// so a 10k-character cap could mean 10k tokens and blow the window on its own.
export function truncateToTokenBudget(text: string, budgetTokens: number): string {
  if (budgetTokens <= 0) return "";
  if (estimateTokens(text) <= budgetTokens) return text;

  const contentBudget = budgetTokens - estimateTokens(TRUNCATION_MARKER);
  if (contentBudget <= 0) return "";

  // estimateTokens is monotonic in prefix length, so binary-search the longest
  // prefix that fits instead of estimating every candidate cut point.
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTokens(text.slice(0, mid)) <= contentBudget) low = mid;
    else high = mid - 1;
  }

  return `${text.slice(0, low)}${TRUNCATION_MARKER}`;
}

// Last-resort shrink of the leading system block. The FIRST system message is
// the behavior contract and is never touched; the later ones carry app data
// and knowledge, so those are what give way when even an empty history would
// overflow. Without this the request went out oversized anyway and
// llama-server rejected the whole turn.
function shrinkSystemHead(head: AiMessage[], budgetTokens: number): AiMessage[] {
  if (head.length < 2) return head;

  const shrinkable = head.length - 1;
  const fixedTokens = estimateMessagesTokens(head.slice(0, shrinkable));
  // 4 tokens of per-message overhead, matching estimateMessageTokens.
  const room = budgetTokens - fixedTokens - 4;

  const next = [...head];
  next[shrinkable] = {
    ...head[shrinkable],
    content: truncateToTokenBudget(head[shrinkable].content, Math.max(0, room)),
  };
  return next;
}

export type FitResult = {
  messages: AiMessage[];
  // How many messages were dropped from the middle (for logging/telemetry).
  dropped: number;
  // True when the system block itself had to be cut, i.e. an upstream producer
  // handed over more context than the window can hold.
  systemTruncated: boolean;
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
  if (messages.length === 0) return { messages, dropped: 0, systemTruncated: false };

  // Leading system block: kept whole whenever it fits. The prompt prefix cache
  // and the app-data privacy/priority ordering both depend on it staying
  // intact, so it only gives way once nothing else can.
  let headEnd = 0;
  while (headEnd < messages.length && messages[headEnd].role === "system") headEnd += 1;
  let head = messages.slice(0, headEnd);
  const rest = messages.slice(headEnd);
  if (rest.length === 0) return { messages, dropped: 0, systemTruncated: false };

  // Final message (current turn) is always kept, even if it alone blows the
  // budget — there is nothing to answer without it, and the overflow-retry
  // path in the gateway is the last resort for that pathological case.
  const last = rest[rest.length - 1];
  const middle = rest.slice(0, -1);

  // Dropping every history turn still isn't enough when the system block alone
  // exceeds the window, so trim it before deciding what history survives.
  //
  // Only when trimming can actually save the request, though: if the current
  // user turn is on its own bigger than the budget, no amount of shrinking
  // makes it fit, and destroying the app context would cost the user their
  // answer quality for nothing. That pathological case stays with the
  // gateway's overflow retry, as before.
  const lastTokens = estimateMessageTokens(last);
  let systemTruncated = false;
  if (lastTokens < budgetTokens && estimateMessagesTokens(head) + lastTokens > budgetTokens) {
    const shrunk = shrinkSystemHead(head, budgetTokens - lastTokens);
    systemTruncated = shrunk !== head;
    head = shrunk;
  }

  const fixed = estimateMessagesTokens(head) + lastTokens;
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
  return { messages: [...head, ...keptMiddle, last], dropped, systemTruncated };
}
