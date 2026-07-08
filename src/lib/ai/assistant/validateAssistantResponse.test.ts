import { describe, expect, it } from "vitest";
import type { DetectedItem } from "../contextCards/types";
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
});
