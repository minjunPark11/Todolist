import { describe, expect, it } from "vitest";
import { buildFallbackContextCardDraft, parseAssistantResponse } from "./schema";

function reply(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

describe("parseAssistantResponse — structured detected_items", () => {
  it("parses structured items and derives per-item flat arrays for the UI", () => {
    const analysis = parseAssistantResponse(
      reply({
        response_mode: "overwhelm",
        input_signals: { decision_signal: "strong", friction_signal: "weak" },
        mode: "ready_for_next_action",
        context_card_draft: {
          title: "brain dump",
          detected_items: [
            { label: "졸업논문", domain: "thesis", work_type: "writing", status: "in-progress", possible_output: "초안 3장", dependency: false, external_pressure: true },
            { label: "중국어 공부", domain: "language", work_type: "memorization", status: "not-started", possible_output: "단어 20개 복습 기록", dependency: false, external_pressure: false },
          ],
          missing_info: [],
        },
        follow_up_questions: [],
        recommended_next_action: { title: "졸업논문: 초안 3장", reason: "마감 임박", completion_criteria: "초안 3장이 남아있으면 완료", estimated_difficulty: "medium" },
        user_facing_response: "정리했습니다.",
      }),
      "졸업논문도 써야 하고 중국어 공부도 해야 해",
    );

    expect(analysis).not.toBeNull();
    expect(analysis!.contextCardDraft!.detectedItems).toEqual(["졸업논문", "중국어 공부"]);
    expect(analysis!.contextCardDraft!.inferredDomains).toEqual(["thesis", "language"]);
    expect(analysis!.contextCardDraft!.workTypes).toEqual(["writing", "memorization"]);
    expect(analysis!.contextCardDraft!.possibleOutputs).toEqual(["초안 3장", "단어 20개 복습 기록"]);
    expect(analysis!.contextCardDraft!.detectedItemDetails).toHaveLength(2);
    expect(analysis!.contextCardDraft!.detectedItemDetails![0].externalPressure).toBe(true);
    expect(analysis!.responseMode).toBe("overwhelm");
  });

  it("still accepts the legacy plain-string detected_items shape", () => {
    const analysis = parseAssistantResponse(
      reply({
        mode: "needs_more_context",
        context_card_draft: { title: "brain dump", detected_items: ["졸업논문", "중국어 공부"] },
        follow_up_questions: ["마감이 언제인가요?"],
        recommended_next_action: null,
        user_facing_response: "질문이 있어요.",
      }),
      "raw",
    );

    expect(analysis!.contextCardDraft!.detectedItems).toEqual(["졸업논문", "중국어 공부"]);
    expect(analysis!.contextCardDraft!.detectedItemDetails).toHaveLength(2);
    expect(analysis!.contextCardDraft!.detectedItemDetails!.every((item) => item.workType === "")).toBe(true);
  });

  it("dedupes structured items that converge on the same possible_output", () => {
    const analysis = parseAssistantResponse(
      reply({
        context_card_draft: {
          title: "brain dump",
          detected_items: [
            { label: "졸업논문", domain: "thesis", possible_output: "초안 3장" },
            { label: "문헌리뷰", domain: "thesis", possible_output: "초안 3장" },
          ],
        },
        user_facing_response: "정리했습니다.",
      }),
      "raw",
    );

    expect(analysis!.contextCardDraft!.detectedItemDetails).toHaveLength(1);
    expect(analysis!.contextCardDraft!.detectedItemDetails![0].label).toContain("졸업논문");
    expect(analysis!.contextCardDraft!.detectedItemDetails![0].label).toContain("문헌리뷰");
  });
});

describe("parseAssistantResponse — response_mode fallback classification", () => {
  it("does not default to overwhelm just because several items were parsed with no signals", () => {
    const analysis = parseAssistantResponse(
      reply({
        response_mode: "not-a-real-mode",
        context_card_draft: {
          title: "brain dump",
          detected_items: ["a", "b", "c"],
        },
        user_facing_response: "정리했습니다.",
      }),
      "raw",
    );
    expect(analysis!.responseMode).not.toBe("overwhelm");
  });

  it("caps follow_up_questions to 1 when the resolved mode is overwhelm", () => {
    const analysis = parseAssistantResponse(
      reply({
        input_signals: { friction_signal: "strong" },
        context_card_draft: { title: "t", detected_items: ["a", "b"] },
        follow_up_questions: ["q1", "q2", "q3"],
        user_facing_response: "정리했습니다.",
      }),
      "raw",
    );
    expect(analysis!.responseMode).toBe("overwhelm");
    expect(analysis!.followUpQuestions.length).toBeLessThanOrEqual(1);
  });

  it("keeps the existing 3-question cap for a non-overwhelm mode", () => {
    const analysis = parseAssistantResponse(
      reply({
        response_mode: "normal_task_request",
        context_card_draft: { title: "t", detected_items: ["a"] },
        follow_up_questions: ["q1", "q2", "q3"],
        user_facing_response: "질문이 있습니다.",
      }),
      "raw",
    );
    expect(analysis!.followUpQuestions).toHaveLength(3);
  });
});

describe("parseAssistantResponse — malformed input", () => {
  it("returns null when no JSON object can be found", () => {
    expect(parseAssistantResponse("that's a nice thought but no structure here", "raw")).toBeNull();
  });

  it("infers mode from recommended_next_action when the mode field is missing", () => {
    const analysis = parseAssistantResponse(
      reply({ context_card_draft: { title: "t", detected_items: [] }, recommended_next_action: { title: "x" }, user_facing_response: "ok" }),
      "raw",
    );
    expect(analysis!.mode).toBe("ready_for_next_action");
  });
});

describe("buildFallbackContextCardDraft", () => {
  it("splits a Korean dump into fragments and keeps them as bare detected items", () => {
    const draft = buildFallbackContextCardDraft("졸업논문 써야 하고 중국어 공부도 해야 해");
    expect(draft.detectedItems.length).toBeGreaterThan(0);
    expect(draft.detectedItemDetails).toHaveLength(draft.detectedItems.length);
    expect(draft.detectedItemDetails!.every((item) => !item.domain && !item.workType)).toBe(true);
  });
});
