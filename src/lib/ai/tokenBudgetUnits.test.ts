// Regression guard for the character-vs-token unit bug: every cap that
// protects the 8192-token llama-server window used to be expressed in
// CHARACTERS, on the assumption of ~4 chars per token. Hangul and CJK cost
// about 1 token per character, so the same caps allowed 2-3x the window and
// llama-server rejected the whole turn.
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_SYSTEM_PROMPT_TOKENS,
  LOCAL_AI_CONTEXT_TOKENS,
  RESPONSE_RESERVE_TOKENS,
  estimateMessageTokens,
  estimateTokens,
  fitMessagesToBudget,
  truncateToTokenBudget,
} from "./promptBudget";
import { ASSISTANT_CONTEXT_LIMITS } from "./assistant/buildAssistantContext";
import { AI_CONTEXT_LIMITS } from "./context/limits";
import type { AiMessage } from "./types";

const KOREAN = "오늘 할 일을 정리해 줘 ";
const LATIN = "review the quarterly report ";

describe("token-based context caps", () => {
  it("costs a Korean cap the same as a latin one, unlike the old character caps", () => {
    const korean = KOREAN.repeat(2000);
    const latin = LATIN.repeat(2000);

    const cappedKorean = truncateToTokenBudget(korean, ASSISTANT_CONTEXT_LIMITS.maxPackTokens);
    const cappedLatin = truncateToTokenBudget(latin, ASSISTANT_CONTEXT_LIMITS.maxPackTokens);

    expect(estimateTokens(cappedKorean)).toBeLessThanOrEqual(ASSISTANT_CONTEXT_LIMITS.maxPackTokens);
    expect(estimateTokens(cappedLatin)).toBeLessThanOrEqual(ASSISTANT_CONTEXT_LIMITS.maxPackTokens);

    // Under the old 10,000-CHARACTER cap the same Korean text passed through
    // at ~7.4k tokens — on its own more than everything the window has left
    // once the system prompt and the reply reserve are paid for.
    const roomForVariableBlocks =
      LOCAL_AI_CONTEXT_TOKENS - ASSISTANT_SYSTEM_PROMPT_TOKENS - RESPONSE_RESERVE_TOKENS;
    expect(estimateTokens(korean.slice(0, 10000))).toBeGreaterThan(roomForVariableBlocks);
    // Latin text of the same length cost ~2.8k, which is why the bug only
    // showed up for CJK users: same cap, ~2.6x the price.
    expect(estimateTokens(korean.slice(0, 10000))).toBeGreaterThan(
      estimateTokens(latin.slice(0, 10000)) * 2,
    );
  });

  it("leaves room for history once the system prompt and reply reserve are paid", () => {
    // The old caps did not: 2832 (system) + 2801 (pack) + 1680 (knowledge) +
    // 1024 (reply) = 8337 > 8192, with zero history, even in English.
    const fixed =
      ASSISTANT_SYSTEM_PROMPT_TOKENS +
      RESPONSE_RESERVE_TOKENS +
      ASSISTANT_CONTEXT_LIMITS.maxPackTokens +
      ASSISTANT_CONTEXT_LIMITS.knowledgeBudgetTokens;

    expect(fixed).toBeLessThan(LOCAL_AI_CONTEXT_TOKENS);
    // Enough left over to be worth calling a conversation.
    expect(LOCAL_AI_CONTEXT_TOKENS - fixed).toBeGreaterThan(500);
  });

  it("keeps the chat path's context cap inside the window too", () => {
    expect(AI_CONTEXT_LIMITS.maxContextTokens + RESPONSE_RESERVE_TOKENS).toBeLessThan(
      LOCAL_AI_CONTEXT_TOKENS,
    );
  });
});

describe("truncateToTokenBudget", () => {
  it("returns short text untouched", () => {
    expect(truncateToTokenBudget("짧은 문장", 100)).toBe("짧은 문장");
  });

  it("marks the cut so the model knows the context is partial", () => {
    const result = truncateToTokenBudget(KOREAN.repeat(500), 50);
    expect(result).toContain("[context truncated]");
    expect(estimateTokens(result)).toBeLessThanOrEqual(50);
  });

  it("finds the longest prefix that fits rather than a crude slice", () => {
    const text = LATIN.repeat(500);
    const result = truncateToTokenBudget(text, 200);
    expect(estimateTokens(result)).toBeLessThanOrEqual(200);
    // Within one character of the boundary: adding anything more would overflow.
    expect(estimateTokens(text.slice(0, result.length + 1))).toBeGreaterThan(
      200 - estimateTokens("\n[context truncated]") - 1,
    );
  });

  it("yields nothing when there is no room at all", () => {
    expect(truncateToTokenBudget("아무 내용", 0)).toBe("");
    expect(truncateToTokenBudget("아무 내용", -5)).toBe("");
  });
});

describe("fitMessagesToBudget system-block guard", () => {
  const system = (content: string): AiMessage => ({ role: "system", content });
  const user = (content: string): AiMessage => ({ role: "user", content });

  it("trims the app-context block when the system block alone overflows", () => {
    // The exact shape that used to hard-fail: a Korean pack far bigger than the
    // window sitting in the untrimmable system head.
    const messages = [
      system("BEHAVIOR CONTRACT"),
      system(KOREAN.repeat(1000)),
      user("정리해 줘"),
    ];
    const result = fitMessagesToBudget(messages, 500);

    expect(result.systemTruncated).toBe(true);
    expect(estimateMessageTokens(result.messages[0])).toBe(estimateMessageTokens(messages[0]));
    // The behavior contract survives intact; only the data block gives way.
    expect(result.messages[0].content).toBe("BEHAVIOR CONTRACT");
    expect(result.messages[1].content.length).toBeLessThan(messages[1].content.length);
    expect(result.messages[result.messages.length - 1].content).toBe("정리해 줘");

    const total = result.messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
    expect(total).toBeLessThanOrEqual(500);
  });

  it("leaves the system block alone when it already fits", () => {
    const messages = [system("SHORT"), system("ALSO SHORT"), user("hi")];
    const result = fitMessagesToBudget(messages, 500);

    expect(result.systemTruncated).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  it("does not sacrifice context when the user's own turn is what overflows", () => {
    // Shrinking the head cannot save this request, so it must not be spent.
    const messages = [system("BEHAVIOR"), system("APP CONTEXT"), user("긴 질문 ".repeat(500))];
    const result = fitMessagesToBudget(messages, 20);

    expect(result.systemTruncated).toBe(false);
    expect(result.messages.slice(0, 2)).toEqual(messages.slice(0, 2));
  });
});
