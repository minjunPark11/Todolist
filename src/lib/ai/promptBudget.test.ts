import { describe, expect, it } from "vitest";
import type { AiMessage } from "./types";
import { estimateMessagesTokens, estimateTokens, fitMessagesToBudget } from "./promptBudget";

function sys(content: string): AiMessage {
  return { role: "system", content };
}
function user(content: string): AiMessage {
  return { role: "user", content };
}
function assistant(content: string): AiMessage {
  return { role: "assistant", content };
}

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("counts CJK/Hangul heavier than latin text", () => {
    // 10 Hangul syllables ≈ 10 tokens; 10 latin chars ≈ 3 tokens.
    expect(estimateTokens("가나다라마바사아자차")).toBeGreaterThan(estimateTokens("abcdefghij"));
  });

  it("grows monotonically with length", () => {
    expect(estimateTokens("hello world hello")).toBeGreaterThan(estimateTokens("hello"));
  });
});

describe("fitMessagesToBudget", () => {
  const head = [sys("SYSTEM PROMPT ".repeat(20)), sys("APP CONTEXT ".repeat(20))];

  it("returns everything unchanged when it already fits", () => {
    const messages = [...head, user("첫 질문"), assistant("답"), user("두번째 질문")];
    const result = fitMessagesToBudget(messages, 100000);
    expect(result.dropped).toBe(0);
    expect(result.messages).toEqual(messages);
  });

  it("keeps the leading system block and the final user message intact", () => {
    const messages = [
      ...head,
      user("가".repeat(500)),
      assistant("나".repeat(500)),
      user("다".repeat(500)),
      assistant("라".repeat(500)),
      user("마지막 질문"),
    ];
    // Budget only large enough for head + last + maybe one middle turn.
    const budget = estimateMessagesTokens(head) + 100;
    const result = fitMessagesToBudget(messages, budget);

    expect(result.messages.slice(0, 2)).toEqual(head);
    expect(result.messages[result.messages.length - 1]).toEqual(user("마지막 질문"));
    expect(result.dropped).toBeGreaterThan(0);
    expect(estimateMessagesTokens(result.messages)).toBeLessThanOrEqual(budget);
  });

  it("drops the OLDEST turns first, never leaving a hole", () => {
    // Each middle turn ~100 tokens so the budget can only hold a couple.
    const pad = "x".repeat(400);
    const messages = [
      ...head,
      user(`OLDEST ${pad}`),
      assistant(`a1 ${pad}`),
      user(`MIDDLE ${pad}`),
      assistant(`a2 ${pad}`),
      user(`NEWEST BEFORE LAST ${pad}`),
      user("현재 질문"),
    ];
    // Room for head + last + about two middle turns.
    const budget = estimateMessagesTokens(head) + estimateTokens("현재 질문") + estimateTokens(pad) * 2 + 30;
    const result = fitMessagesToBudget(messages, budget);

    const kept = result.messages.map((m) => m.content);
    expect(result.dropped).toBeGreaterThan(0);
    expect(kept.some((c) => c.startsWith("OLDEST"))).toBe(false);
    expect(kept).toContain("현재 질문");
    // If a newer middle turn was kept, no older one may reappear after it.
    if (kept.some((c) => c.startsWith("MIDDLE"))) {
      expect(kept.some((c) => c.startsWith("NEWEST BEFORE LAST"))).toBe(true);
    }
  });

  it("always keeps the final message even if it alone exceeds the budget", () => {
    const messages = [...head, user("이것은 예산보다 큰 아주 긴 질문입니다 ".repeat(50))];
    const result = fitMessagesToBudget(messages, 10);
    expect(result.messages[result.messages.length - 1]).toEqual(messages[messages.length - 1]);
    expect(result.messages.slice(0, 2)).toEqual(head);
  });

  it("handles an all-system message array without trimming", () => {
    const result = fitMessagesToBudget(head, 1);
    expect(result).toEqual({ messages: head, dropped: 0, systemTruncated: false });
  });

  it("handles an empty array", () => {
    expect(fitMessagesToBudget([], 100)).toEqual({ messages: [], dropped: 0, systemTruncated: false });
  });
});
