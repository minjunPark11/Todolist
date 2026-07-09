import { describe, expect, it } from "vitest";
import type { DetectedItem, InfoSlot } from "../contextCards/types";
import { isObservableOutput } from "./overwhelmHeuristics";
import type { AssistantAnalysis, InputSignals } from "./types";
import { buildFallbackOverwhelmResponse, validateAssistantResponse } from "./validateAssistantResponse";

const NONE: InputSignals = {
  decisionSignal: "none",
  frictionSignal: "none",
  lowActionabilitySignal: "none",
  blockerSignal: "none",
  externalPressureSignal: "none",
  unscopedProjectSignal: "none",
};

function item(overrides: Partial<DetectedItem> = {}): DetectedItem {
  return {
    label: "졸업논문",
    domain: "thesis",
    workType: "writing",
    status: "in-progress",
    possibleOutput: "초안 3장",
    dependency: false,
    externalPressure: false,
    ...overrides,
  };
}

function analysis(overrides: Partial<AssistantAnalysis> = {}): AssistantAnalysis {
  return {
    mode: "ready_for_next_action",
    responseMode: "overwhelm",
    inputSignals: NONE,
    contextCardDraft: null,
    followUpQuestions: [],
    recommendedNextAction: { title: "졸업논문: 초안 3장", reason: "가장 급함", completionCriteria: "초안 3장이 남아있으면 완료", estimatedDifficulty: "low" },
    safeActionProposals: [],
    learningPathProposal: null,
    userFacingResponse: "여러 일이 섞여 있어 보이네요. 졸업논문의 초안 3장 작성부터 시작해보세요.",
    ...overrides,
  };
}

describe("validateAssistantResponse — scope", () => {
  it("skips the guard entirely for domain_specific responses", () => {
    const result = validateAssistantResponse(analysis({ responseMode: "domain_specific", recommendedNextAction: null, userFacingResponse: "" }), []);
    expect(result.ok).toBe(true);
  });

  it("skips the guard for learning_request responses", () => {
    const result = validateAssistantResponse(analysis({ responseMode: "learning_request", recommendedNextAction: null }), []);
    expect(result.ok).toBe(true);
  });
});

describe("validateAssistantResponse — overwhelm structural checks", () => {
  it("passes a well-formed overwhelm response", () => {
    const result = validateAssistantResponse(analysis(), [item()]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when there is no next action", () => {
    const result = validateAssistantResponse(analysis({ recommendedNextAction: null }), [item()]);
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("no next action"))).toBe(true);
  });

  it("fails when completion criteria is vague", () => {
    const result = validateAssistantResponse(
      analysis({ recommendedNextAction: { title: "t", reason: "r", completionCriteria: "이해하면 완료" } }),
      [item()],
    );
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("not observable"))).toBe(true);
  });

  it("fails when 2+ detected items are missing both work_type and possible_output", () => {
    const items = [item(), item({ label: "코딩 에러", workType: "", possibleOutput: "" })];
    const result = validateAssistantResponse(analysis(), items);
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("work_type/possible_output"))).toBe(true);
  });

  it("fails when more than one follow-up question is asked", () => {
    const result = validateAssistantResponse(analysis({ followUpQuestions: ["q1", "q2"] }), [item()]);
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("follow-up"))).toBe(true);
  });

  it("fails when the response never references any detected item", () => {
    const result = validateAssistantResponse(analysis({ userFacingResponse: "무엇을 먼저 하고 싶으신가요?" }), [item({ label: "중국어 회화 연습" })]);
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("does not reference"))).toBe(true);
  });

  it("fails when the response contains an unrequested timetable", () => {
    const result = validateAssistantResponse(
      analysis({ userFacingResponse: "9시 논문, 11시 코딩, 오후 2시 복습, 4시 서류 준비" }),
      [item()],
    );
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("timetable"))).toBe(true);
  });

  it("fails when the response re-offers a preference question instead of structuring", () => {
    const result = validateAssistantResponse(
      analysis({ userFacingResponse: "어떤 것을 하고 싶으신지 알려주시겠어요? 가장 시급한 것부터 처리하세요." }),
      [item()],
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateAssistantResponse — planning_request checks", () => {
  it("does not require a next action to exist for planning responses", () => {
    const result = validateAssistantResponse(analysis({ responseMode: "planning_request", recommendedNextAction: null }), [item()]);
    expect(result.ok).toBe(true);
  });

  it("still flags a vague completion criteria when a next action is present", () => {
    const result = validateAssistantResponse(
      analysis({ responseMode: "planning_request", recommendedNextAction: { title: "t", reason: "r", completionCriteria: "열심히 하면 완료" } }),
      [item()],
    );
    expect(result.ok).toBe(false);
  });
});

describe("buildFallbackOverwhelmResponse", () => {
  it("builds a response grounded in the actual parsed items with an observable completion criteria", () => {
    const items = [item({ label: "졸업논문", dependency: true }), item({ label: "비자 서류", domain: "admin", possibleOutput: "제출 서류 목록", externalPressure: true })];
    const fallback = buildFallbackOverwhelmResponse("논문도 써야 하고 비자 서류도 내야 해서 뭐부터 할지 모르겠어", items);

    expect(fallback.userFacingResponse).toContain("졸업논문");
    expect(fallback.recommendedNextAction.title).toContain("졸업논문");
    expect(isObservableOutput(fallback.recommendedNextAction.completionCriteria)).toBe(true);
    expect(fallback.followUpQuestions.length).toBeLessThanOrEqual(1);
  });

  it("never invents a timetable or generic phrasing", () => {
    const items = [item({ label: "중국어 공부" }), item({ label: "졸업논문" })];
    const fallback = buildFallbackOverwhelmResponse("중국어 공부도 하고 논문도 써야 하는데 막막해", items);
    expect(/\d{1,2}\s?시/.test(fallback.userFacingResponse)).toBe(false);
  });

  it("parks the remaining items as on-hold instead of dropping them or asking back", () => {
    const items = [
      item({ label: "중국어 복습", domain: "", workType: "", possibleOutput: "" }),
      item({ label: "앱 버그 수정", domain: "", workType: "", possibleOutput: "" }),
      item({ label: "논문 피드백 반영", domain: "", workType: "", possibleOutput: "" }),
    ];
    const fallback = buildFallbackOverwhelmResponse("다 밀렸어. 뭐부터 해야 해?", items);

    expect(fallback.recommendedNextAction.title).toContain("논문 피드백 반영");
    expect(fallback.userFacingResponse).toContain("보류");
    expect(fallback.userFacingResponse).toContain("중국어 복습");
    expect(fallback.userFacingResponse).toContain("앱 버그 수정");
    expect(fallback.followUpQuestions).toEqual([]);
    expect(fallback.userFacingResponse).not.toMatch(/\?\s*$/);
  });

  it("keeps the next action title and completion criteria out of the body — the card owns them", () => {
    const items = [
      item({ label: "논문 피드백 반영", workType: "", possibleOutput: "" }),
      item({ label: "중국어 복습", domain: "", workType: "", possibleOutput: "" }),
    ];
    const fallback = buildFallbackOverwhelmResponse("논문 피드백 반영이랑 중국어 복습이 다 밀렸어", items);

    expect(fallback.userFacingResponse).not.toContain(fallback.recommendedNextAction.title);
    expect(fallback.userFacingResponse).not.toContain(fallback.recommendedNextAction.completionCriteria);
    expect(fallback.userFacingResponse).not.toContain("다음 행동:");
    // The chosen label appears exactly once in the body (in the reason line).
    expect(fallback.userFacingResponse.match(/논문 피드백 반영/g)).toHaveLength(1);
  });

  it("asks the single highest-priority unresolved slot question when info is still missing", () => {
    const slots: InfoSlot[] = [
      { kind: "done_criteria", question: "끝나면 어떤 산출물이 남아 있나요?", answer: "" },
      { kind: "deadline", question: "마감이 있나요?", answer: "" },
    ];
    const fallback = buildFallbackOverwhelmResponse("논문 피드백 반영이 밀렸어", [item({ label: "논문 피드백 반영" })], slots);

    expect(fallback.followUpQuestions).toEqual(["끝나면 어떤 산출물이 남아 있나요?"]);
  });

  it("asks nothing once the required slots are resolved, even when optional slots are still open", () => {
    // The unresolved time_budget slot exercises the planned-stage gate: without
    // it, chooseNextSlotToAsk would return null anyway and the gate could be
    // deleted without this test noticing.
    const slots: InfoSlot[] = [
      { kind: "done_criteria", question: "", answer: "수정 메모 3줄", source: "derived" },
      { kind: "deadline", question: "", answer: "금요일까지", source: "user_answer" },
      { kind: "blocked_point", question: "", answer: "아직 시작 전", source: "user_answer" },
      { kind: "time_budget", question: "이번 주에 쓸 수 있는 시간이 얼마나 되나요?", answer: "" },
    ];
    const fallback = buildFallbackOverwhelmResponse("논문 피드백 반영이 밀렸어", [item({ label: "논문 피드백 반영" })], slots);

    expect(fallback.followUpQuestions).toEqual([]);
    expect(fallback.userFacingResponse).toContain("바로 시작");
  });

  it("does not hand the user the final deliverable as the fallback next action", () => {
    // The reported runtime failure: possible_output was the end deliverable
    // ("피드백 반영된 논문 초안") and the fallback promoted it verbatim.
    const items = [item({ label: "논문 피드백 반영", workType: "작업 반영", possibleOutput: "피드백 반영된 논문 초안" })];
    const fallback = buildFallbackOverwhelmResponse("논문 피드백 반영이 밀렸어. 시작을 못 하겠어.", items);

    expect(fallback.recommendedNextAction.title).not.toContain("피드백 반영된 논문 초안");
    expect(fallback.recommendedNextAction.title).toContain("1개");
    expect(isObservableOutput(fallback.recommendedNextAction.completionCriteria)).toBe(true);
  });
});
