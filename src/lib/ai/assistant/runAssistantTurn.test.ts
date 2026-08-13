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
import { buildAssistantHistoryText } from "./historyEcho";
import { runAssistantTurn } from "./runAssistantTurn";

const OVERWHELM_DUMP =
  "해야 할 게 너무 많아서 시작을 못 하겠어. 논문 피드백 반영, 앱 버그 수정, LeetCode 공부, 중국어 복습이 다 밀렸어. 뭐부터 해야 해?";

// Same obligations, mentioned routine-first: the fallback pick must not
// depend on input order.
const REORDERED_OVERWHELM_DUMP =
  "해야 할 게 너무 많아서 시작을 못 하겠어. 중국어 복습, LeetCode 공부, 앱 버그 수정, 논문 피드백 반영이 다 밀렸어. 뭐부터 해야 해?";

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
    expect(turn.recommendedNextAction).not.toBeNull();
    expect(turn.recommendedNextAction!.completionCriteria.trim()).not.toBe("");
    // Role split: the next action and its completion criteria live on the
    // card only — the body must not restate them.
    expect(turn.userFacingText).not.toContain(turn.recommendedNextAction!.title);
    expect(turn.userFacingText).not.toContain("다음 행동:");
    // The optional info-gathering question obeys the "at most 1" guard rule.
    expect(turn.followUpQuestions.length).toBeLessThanOrEqual(1);
  });

  it("picks the external-deliverable item in the fallback even when routine items are mentioned first", async () => {
    mockReply(GENERIC_ADVICE);

    const turn = await runAssistantTurn({ ...turnInput(), brainDump: REORDERED_OVERWHELM_DUMP });

    expect(turn.usedGenericFailureFallback).toBe(true);
    expect(turn.recommendedNextAction).not.toBeNull();
    expect(turn.recommendedNextAction!.title).toContain("논문 피드백 반영");
    expect(turn.recommendedNextAction!.title).not.toContain("중국어 복습");
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

  it("attaches info slots and a deterministic stage even on the fallback path", async () => {
    mockReply(GENERIC_ADVICE);

    const turn = await runAssistantTurn(turnInput());

    const slots = turn.contextCardDraft.infoSlots ?? [];
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.map((slot) => slot.kind)).toContain("done_criteria");
    // Label-only fallback items leave done_criteria unresolved → scoping.
    expect(turn.contextCardDraft.stage).toBe("scoping");
    // A plan exists only on planned cards — never before info gathering ends.
    expect(turn.contextCardDraft.plan).toBeUndefined();
  });

  it("computes stage=planned when the model answers the required slots and gives a next action", async () => {
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
              status: "in-progress",
              possible_output: "피드백 반영된 절 1개",
              dependency: false,
              external_pressure: true,
            },
          ],
          info_slots: [
            { kind: "done_criteria", question: "", answer: "피드백 반영된 절 1개", source: "derived" },
            { kind: "deadline", question: "", answer: "금요일 미팅 전까지", source: "user_answer" },
            { kind: "blocked_point", question: "", answer: "코멘트 목록 정리까지 함", source: "user_answer" },
          ],
          likely_blockers: [],
          missing_info: [],
          related_task_ids: [],
          related_project_ids: [],
          related_note_paths: [],
        },
        follow_up_questions: [],
        recommended_next_action: {
          title: "논문 피드백 반영: 첫 번째 코멘트 1개 반영",
          reason: "외부 마감과 연결되어 있습니다.",
          completion_criteria: "해당 절의 수정본이 저장되어 있으면 완료",
          estimated_difficulty: "low",
        },
        user_facing_response: "논문 피드백 반영부터 시작하는 게 안전합니다. 첫 번째 코멘트 1개만 반영해보세요.",
      }),
    );

    const turn = await runAssistantTurn(turnInput());

    expect(turn.validation.ok).toBe(true);
    expect(turn.contextCardDraft.stage).toBe("planned");
    const deadline = turn.contextCardDraft.infoSlots?.find((slot) => slot.kind === "deadline");
    expect(deadline?.answer).toBe("금요일 미팅 전까지");
    expect(deadline?.source).toBe("user_answer");

    // Planned card, no model plan_steps → the deterministic fallback plan:
    // step 0 is the recommended next action, and the plan closes by deferring
    // the next decision instead of scheduling everything up front.
    const plan = turn.contextCardDraft.plan ?? [];
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan[0].title).toBe("논문 피드백 반영: 첫 번째 코멘트 1개 반영");
    expect(plan[0].startCue.trim()).not.toBe("");
    expect(plan[plan.length - 1].title).toContain("다음 실행 단위");
  });

  it("keeps the model's valid plan steps after the anchored first step and drops unusable ones", async () => {
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
              status: "in-progress",
              possible_output: "피드백 반영된 절 1개",
              dependency: false,
              external_pressure: true,
            },
          ],
          info_slots: [
            { kind: "done_criteria", question: "", answer: "피드백 반영된 절 1개", source: "derived" },
            { kind: "deadline", question: "", answer: "금요일 미팅 전까지", source: "user_answer" },
            { kind: "blocked_point", question: "", answer: "코멘트 목록 정리까지 함", source: "user_answer" },
          ],
          plan_steps: [
            {
              title: "첫 번째 코멘트 1개 반영",
              why: "이미 추천한 행동과 같음",
              start_cue: "원고 열기",
              completion_criteria: "수정본 저장",
            },
            {
              title: "나머지 코멘트를 훑고 다음 반영 대상 1개 고르기",
              why: "다음 반영 범위가 정해져요",
              start_cue: "코멘트 목록 열기",
              completion_criteria: "다음 대상 1개가 메모에 남아 있으면 끝",
            },
            {
              title: "열심히 나머지도 진행하기",
              why: "",
              start_cue: "오전 9시에 시작",
              completion_criteria: "이해하면 완료",
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
          title: "논문 피드백 반영: 첫 번째 코멘트 1개 반영",
          reason: "외부 마감과 연결되어 있습니다.",
          completion_criteria: "해당 절의 수정본이 저장되어 있으면 완료",
          estimated_difficulty: "low",
        },
        user_facing_response: "논문 피드백 반영부터 시작하는 게 안전합니다.",
      }),
    );

    const turn = await runAssistantTurn(turnInput());

    expect(turn.contextCardDraft.stage).toBe("planned");
    const plan = turn.contextCardDraft.plan ?? [];
    // Step 0 anchored on the next action; the model's duplicate of it and its
    // vague/clock-time step are gone; the valid follow-through survives.
    expect(plan).toHaveLength(2);
    expect(plan[0].title).toBe("논문 피드백 반영: 첫 번째 코멘트 1개 반영");
    expect(plan[1].title).toBe("나머지 코멘트를 훑고 다음 반영 대상 1개 고르기");
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

// Unified Chat slice 2: the light "just answer it" modes (domain_specific /
// learning_request) mark the turn isDirectAnswer so the UI shows only the
// reply — no card, next action, or plan — and the history echo carries no
// [draft]. This is what lets the single engine also serve plain chat.
describe("runAssistantTurn — direct-answer (light) modes", () => {
  function directReply(mode: "domain_specific" | "learning_request", text: string) {
    return JSON.stringify({
      response_mode: mode,
      input_signals: {},
      mode: "ready_for_next_action",
      context_card_draft: null,
      follow_up_questions: [],
      recommended_next_action: null,
      user_facing_response: text,
    });
  }

  it("marks a domain_specific answer as direct and skips the guard", async () => {
    mockReply(directReply("domain_specific", "재귀는 함수가 자기 자신을 호출하는 기법이에요. 종료 조건이 핵심입니다."));

    const turn = await runAssistantTurn({ ...turnInput(), brainDump: "재귀가 뭐야?" });

    expect(turn.isDirectAnswer).toBe(true);
    expect(turn.responseMode).toBe("domain_specific");
    expect(turn.validation.ok).toBe(true);
    expect(turn.usedGenericFailureFallback).toBe(false);
    expect(turn.userFacingText).toContain("재귀는");
    // History echo is just the reply — no [draft] block to bloat the budget.
    expect(buildAssistantHistoryText(turn)).toBe(turn.userFacingText);
    expect(buildAssistantHistoryText(turn)).not.toContain("[draft]");
  });

  it("treats learning_request as a direct answer too", async () => {
    mockReply(directReply("learning_request", "이분 탐색은 정렬된 배열에서 반씩 줄여가며 찾는 방법이에요."));

    const turn = await runAssistantTurn({ ...turnInput(), brainDump: "이분 탐색 설명해줘" });

    expect(turn.isDirectAnswer).toBe(true);
    expect(turn.responseMode).toBe("learning_request");
  });

  it("does NOT mark an overwhelm turn as direct", async () => {
    mockReply(GENERIC_ADVICE);

    const turn = await runAssistantTurn(turnInput());

    expect(turn.isDirectAnswer).toBe(false);
  });
});

// The learning_path double gate: the model's proposal may only surface on
// turns where the user explicitly asked for a path (pathDraft.ts trigger).
describe("runAssistantTurn — learning path gate", () => {
  const PATH_REPLY = JSON.stringify({
    response_mode: "planning_request",
    input_signals: {},
    mode: "ready_for_next_action",
    context_card_draft: {
      title: "중국어 학습",
      detected_items: [
        {
          label: "중국어 공부",
          domain: "언어",
          work_type: "학습",
          status: "not-started",
          possible_output: "학습 노트 1개",
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
      title: "중국어 공부: 병음표 1장 훑고 메모 남기기",
      reason: "가장 앞 단계라서요.",
      completion_criteria: "병음 메모 1개가 남아 있으면 완료",
      estimated_difficulty: "low",
    },
    learning_path: {
      goal: "HSK4 수준 중국어",
      milestones: [
        { title: "병음과 성조", done_criteria: "병음표 정리 노트 1개" },
        { title: "기초 어법", done_criteria: "어법 예문 노트 1개" },
        { title: "HSK4 단어 800개", done_criteria: "단어장 체크리스트 완주 기록" },
      ],
    },
    user_facing_response: "중국어 학습을 단계로 나눠 봤어요. 첫 단계인 병음부터 가볍게 시작해 보세요.",
  });

  it("surfaces a validated path draft when the user explicitly asked for one", async () => {
    mockReply(PATH_REPLY);

    const turn = await runAssistantTurn({ ...turnInput(), brainDump: "중국어 배우는 학습 경로 만들어줘" });

    expect(turn.learningPathDraft).not.toBeNull();
    expect(turn.learningPathDraft!.goal).toBe("HSK4 수준 중국어");
    expect(turn.learningPathDraft!.milestones).toHaveLength(3);
    expect(turn.learningPathDraft!.milestones.every((m) => m.cardIds.length === 0)).toBe(true);
  });

  it("ignores a model-emitted learning_path when the user did not ask for a path", async () => {
    mockReply(PATH_REPLY);

    const turn = await runAssistantTurn(turnInput()); // ordinary overwhelm dump

    expect(turn.learningPathDraft).toBeNull();
    // The rest of the turn is unaffected by the dropped proposal.
    expect(turn.recommendedNextAction).not.toBeNull();
  });

  it("drops a proposal that fails deterministic validation (too few milestones)", async () => {
    const thin = JSON.parse(PATH_REPLY);
    thin.learning_path.milestones = thin.learning_path.milestones.slice(0, 2);
    mockReply(JSON.stringify(thin));

    const turn = await runAssistantTurn({ ...turnInput(), brainDump: "중국어 배우는 학습 경로 만들어줘" });

    expect(turn.learningPathDraft).toBeNull();
  });
});
