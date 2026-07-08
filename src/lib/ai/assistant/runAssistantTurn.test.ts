import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiChatResponse } from "../types";
import { containsGenericFailurePhrases } from "./overwhelmHeuristics";
import type { AssistantTurnInput } from "./runAssistantTurn";

vi.mock("../gateway", () => ({ sendAiChat: vi.fn() }));
vi.mock("../contextCards/store", () => ({ loadContextCards: vi.fn(() => []) }));
vi.mock("./buildAssistantContext", () => ({
  buildAssistantContextPack: vi.fn(async () => ({
    contextText: "context",
    knowledgeContext: undefined,
    relatedCards: [],
    knowledgeSources: [],
    knownTaskIds: new Set<string>(),
    knownProjectIds: new Set<string>(),
    knownNotePaths: new Set<string>(),
  })),
}));

import { sendAiChat } from "../gateway";
import { runAssistantTurn } from "./runAssistantTurn";

const OVERWHELM_DUMP =
  "해야 할 게 너무 많아서 시작을 못 하겠어. 논문 피드백 반영, 앱 버그 수정, LeetCode 공부, 중국어 복습이 다 밀렸어. 뭐부터 해야 해?";

const GENERIC_ADVICE =
  "우선 가장 시급하고 중요한 일을 찾아보세요. 현재 상황에서 가장 시급한 일은 무엇인지 판단해보세요. 모든 일을 균형 있게 배분하는 것도 좋습니다.";

function mockReply(content: string) {
  vi.mocked(sendAiChat).mockResolvedValue({ content, provider: "llama-server" } satisfies AiChatResponse);
}

function turnInput(): AssistantTurnInput {
  return {
    brainDump: OVERWHELM_DUMP,
    appData: {} as AssistantTurnInput["appData"],
  };
}

beforeEach(() => {
  vi.mocked(sendAiChat).mockReset();
});

describe("runAssistantTurn — Generic Failure Guard on unparseable replies", () => {
  it("never surfaces raw non-JSON generic advice; routes it through the deterministic fallback", async () => {
    mockReply(GENERIC_ADVICE);

    const turn = await runAssistantTurn(turnInput());

    expect(turn.validation.ok).toBe(false);
    expect(turn.usedGenericFailureFallback).toBe(true);
    expect(turn.usedFallbackDraft).toBe(true);
    expect(turn.userFacingText).not.toContain("가장 시급");
    expect(containsGenericFailurePhrases(turn.userFacingText)).toBe(false);
    // The fallback must reference the user's actual items — not the complaint
    // or the "what first?" question — pick one first action, and give
    // observable completion criteria.
    expect(turn.userFacingText).toContain("논문 피드백 반영");
    expect(turn.userFacingText).not.toContain("뭐부터 해야 해(");
    expect(turn.userFacingText).toContain("다음 행동");
    expect(turn.recommendedNextAction).not.toBeNull();
    expect(turn.recommendedNextAction!.completionCriteria.trim()).not.toBe("");
  });

  it("keeps a well-formed overwhelm reply untouched", async () => {
    mockReply(
      JSON.stringify({
        response_mode: "overwhelm",
        input_signals: { decision_signal: "strong", friction_signal: "strong" },
        mode: "ready_for_next_action",
        context_card_draft: {
          title: "밀린 일 정리",
          detected_items: [
            {
              label: "논문 피드백 반영",
              domain: "연구",
              work_type: "수정",
              status: "not-started",
              possible_output: "피드백 반영된 초안 1개 절",
              dependency: false,
              external_pressure: true,
            },
            {
              label: "앱 버그 수정",
              domain: "개발",
              work_type: "디버깅",
              status: "stuck",
              possible_output: "재현 조건 기록",
              dependency: false,
              external_pressure: false,
            },
          ],
          likely_blockers: [],
          missing_info: [],
          related_task_ids: [],
          related_project_ids: [],
          related_note_paths: [],
        },
        follow_up_questions: [],
        recommended_next_action: {
          title: "논문 피드백 반영: 피드백 목록에서 첫 번째 코멘트 1개 반영",
          reason: "외부 마감과 연결되어 있습니다.",
          completion_criteria: "해당 절의 수정본이 저장되어 있으면 완료",
          estimated_difficulty: "low",
        },
        user_facing_response:
          "논문 피드백 반영(수정), 앱 버그 수정(디버깅) 등 4가지가 섞여 있네요. 외부 마감이 걸린 논문 피드백 반영부터 시작하는 게 안전합니다.",
      }),
    );

    const turn = await runAssistantTurn(turnInput());

    expect(turn.validation.ok).toBe(true);
    expect(turn.usedGenericFailureFallback).toBe(false);
    expect(turn.responseMode).toBe("overwhelm");
    expect(turn.userFacingText).toContain("논문 피드백");
  });

  it("replaces a parsed overwhelm reply whose text is still generic advice", async () => {
    mockReply(
      JSON.stringify({
        response_mode: "overwhelm",
        input_signals: { decision_signal: "strong", friction_signal: "strong" },
        mode: "ready_for_next_action",
        context_card_draft: {
          title: "밀린 일",
          detected_items: [
            {
              label: "논문 피드백 반영",
              domain: "연구",
              work_type: "수정",
              status: "",
              possible_output: "피드백 반영된 초안",
              dependency: false,
              external_pressure: true,
            },
            {
              label: "중국어 복습",
              domain: "언어",
              work_type: "복습",
              status: "",
              possible_output: "복습 기록",
              dependency: false,
              external_pressure: false,
            },
          ],
          likely_blockers: [],
          missing_info: [],
          related_task_ids: [],
          related_project_ids: [],
          related_note_paths: [],
        },
        follow_up_questions: [],
        recommended_next_action: null,
        user_facing_response: "우선 가장 시급하고 중요한 일을 찾아보세요.",
      }),
    );

    const turn = await runAssistantTurn(turnInput());

    expect(turn.validation.ok).toBe(false);
    expect(turn.usedGenericFailureFallback).toBe(true);
    expect(containsGenericFailurePhrases(turn.userFacingText)).toBe(false);
    expect(turn.userFacingText).toContain("논문 피드백 반영");
    expect(turn.recommendedNextAction).not.toBeNull();
  });
});
