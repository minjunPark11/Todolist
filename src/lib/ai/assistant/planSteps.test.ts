import { describe, expect, it } from "vitest";
import type { DetectedItem, PlanStep, RecommendedNextAction } from "../contextCards/types";
import { isObservableOutput } from "./overwhelmHeuristics";
import { MAX_PLAN_STEPS, buildFallbackPlanSteps, defaultStartCueForItem, resolvePlanSteps, validatePlanStep } from "./planSteps";

function item(overrides: Partial<DetectedItem> = {}): DetectedItem {
  return {
    label: "논문 피드백 반영",
    domain: "연구",
    workType: "수정",
    status: "in-progress",
    possibleOutput: "피드백 반영된 절 1개",
    dependency: false,
    externalPressure: true,
    ...overrides,
  };
}

function nextAction(overrides: Partial<RecommendedNextAction> = {}): RecommendedNextAction {
  return {
    title: "논문 피드백 반영: 첫 번째 코멘트 1개 반영",
    reason: "마감이 걸려 있는 일이라 먼저 잡아요.",
    completionCriteria: "해당 절의 수정본이 저장되어 있으면 완료",
    estimatedDifficulty: "low",
    ...overrides,
  };
}

function step(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    title: "나머지 코멘트를 훑고 다음 반영 대상 1개 고르기",
    why: "다음 반영 범위가 정해져요.",
    startCue: "코멘트 목록 열기",
    completionCriteria: "다음 대상 1개가 메모에 남아 있으면 끝",
    ...overrides,
  };
}

describe("validatePlanStep — internal SMART checks", () => {
  it("passes a concrete, startable step", () => {
    expect(validatePlanStep(step())).toEqual([]);
  });

  it("fails a vague completion criteria", () => {
    const failures = validatePlanStep(step({ completionCriteria: "이해하면 완료" }));
    expect(failures.some((failure) => failure.includes("not observable"))).toBe(true);
  });

  it("fails a vague title", () => {
    const failures = validatePlanStep(step({ title: "열심히 진행하기" }));
    expect(failures.some((failure) => failure.includes("vague"))).toBe(true);
  });

  it("fails a clock-time start cue — schedules are never invented", () => {
    const failures = validatePlanStep(step({ startCue: "오전 9시에 책상 앞" }));
    expect(failures.some((failure) => failure.includes("clock time"))).toBe(true);
  });

  it("fails a step that smuggles in a timetable", () => {
    const failures = validatePlanStep(step({ why: "월요일 화요일 수요일에 나눠서 진행해요." }));
    expect(failures.some((failure) => failure.includes("timetable"))).toBe(true);
  });
});

describe("resolvePlanSteps", () => {
  it("always anchors step 0 on the recommended next action, not the model's first step", () => {
    const plan = resolvePlanSteps([step()], [item()], nextAction());
    expect(plan[0].title).toBe(nextAction().title);
    expect(plan[0].completionCriteria).toBe(nextAction().completionCriteria);
    expect(plan[0].startCue).not.toBe("");
    expect(plan[1].title).toBe(step().title);
  });

  it("repairs a missing start cue from the item's category instead of dropping the step", () => {
    const plan = resolvePlanSteps([step({ startCue: "" })], [item()], nextAction());
    expect(plan).toHaveLength(2);
    expect(plan[1].startCue).toBe(defaultStartCueForItem(item()));
  });

  it("drops an invalid step but keeps the valid ones in order", () => {
    const plan = resolvePlanSteps([step({ completionCriteria: "이해하면 완료" }), step({ title: "수정 이력 3줄로 요약해 두기" })], [item()], nextAction());
    expect(plan).toHaveLength(2);
    expect(plan[1].title).toBe("수정 이력 3줄로 요약해 두기");
  });

  it("drops a model step that duplicates the recommended next action", () => {
    const duplicate = step({ title: "첫 번째 코멘트 1개 반영" });
    const plan = resolvePlanSteps([duplicate, step()], [item()], nextAction());
    expect(plan).toHaveLength(2);
    expect(plan[1].title).toBe(step().title);
  });

  it("falls back to the deterministic plan when the model gave nothing usable", () => {
    const plan = resolvePlanSteps([], [item()], nextAction());
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);
    expect(plan[0].title).toBe(nextAction().title);
    expect(plan[plan.length - 1].title).toContain("다음 실행 단위");
    for (const planStep of plan) {
      expect(validatePlanStep(planStep)).toEqual([]);
    }
  });

  it("caps the plan at MAX_PLAN_STEPS", () => {
    const many = [1, 2, 3, 4, 5].map((n) => step({ title: `후속 정리 메모 ${n}쪽 남기기` }));
    const plan = resolvePlanSteps(many, [item()], nextAction());
    expect(plan.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);
  });

  it("returns no plan without a next action to anchor on", () => {
    expect(resolvePlanSteps([step()], [item()], null)).toEqual([]);
  });
});

describe("buildFallbackPlanSteps — category follow-through", () => {
  it("gives an external-deliverable item a feedback-anchored follow-through and start cues", () => {
    const plan = buildFallbackPlanSteps(nextAction(), item());
    expect(plan[0].startCue).toContain("피드백");
    expect(plan[1].title).toContain("반영");
    for (const planStep of plan) {
      expect(isObservableOutput(planStep.completionCriteria)).toBe(true);
      expect(planStep.startCue.trim()).not.toBe("");
      expect(planStep.why.trim()).not.toBe("");
    }
  });

  it("gives a debugging item a reproduction follow-through", () => {
    const debugItem = item({ label: "앱 버그 수정", domain: "개발", workType: "디버깅", possibleOutput: "", externalPressure: false });
    const plan = buildFallbackPlanSteps(
      nextAction({ title: "앱 버그 수정: 재현 조건 1개랑 에러 메시지 1개만 메모로 남기기", completionCriteria: "메모가 남아 있으면 끝" }),
      debugItem,
    );
    expect(plan[0].startCue).toContain("로그");
    expect(plan[1].title).toContain("재현");
  });
});
