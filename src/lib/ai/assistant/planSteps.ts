// Deterministic plan layer for the goal→execution pipeline (slice 3 of the
// stuck-to-execution vision). Same philosophy as infoSlots.ts: the model
// proposes plan_steps via prompts.ts, these pure functions decide which steps
// are actually usable and repair or replace the rest.
//
// SMART is the internal quality bar here, never the UI: each check below maps
// to one letter (Specific / Measurable / Achievable / Relevant / Startable —
// time-bound is deliberately reinterpreted as a physical start cue, because
// inventing clock times would collide with the looksLikeTimetable guard).
// None of this terminology may appear in user-facing strings.
import type { DetectedItem, PlanStep, RecommendedNextAction } from "../contextCards/types";
import {
  chooseFirstItem,
  isObservableOutput,
  itemSemanticText,
  looksLikeDeadlineOrExternalProject,
  looksLikeDebuggingItem,
  looksLikeRoutineLearningItem,
  looksLikeTimetable,
} from "./overwhelmHeuristics";

export const MAX_PLAN_STEPS = 4;

// A start cue must be a physical trigger (what to open / where to be), never
// a clock time — schedules are the user's, not the assistant's, to invent.
const CLOCK_TIME_PATTERN = /\d{1,2}\s?(시|:\d{2}|am|pm)/i;

// Category-level start cues, keyed on the same lexical signals the priority
// heuristic uses, so the cue names the kind of thing the chosen item's own
// text says it is.
export function defaultStartCueForItem(item: DetectedItem | null): string {
  const text = item ? itemSemanticText(item) : "";
  if (looksLikeDebuggingItem(text)) return "에러가 났던 화면이나 로그 열기";
  if (looksLikeDeadlineOrExternalProject(text)) return "피드백 문서나 코멘트 목록 열기";
  if (looksLikeRoutineLearningItem(text)) return "학습 노트나 앱 열기";
  return "관련 메모나 자료 열기";
}

// Internal SMART verdict for one model-proposed step. Failure strings are
// debug metadata (console/log), never surfaced to the user.
export function validatePlanStep(step: PlanStep): string[] {
  const failures: string[] = [];
  // Specific: a real action phrase, not a vague state or stock phrase.
  if (!step.title.trim() || !isObservableOutput(step.title)) failures.push("title is vague or empty");
  // Measurable: done must be an observable yes/no artifact.
  if (!step.completionCriteria.trim() || !isObservableOutput(step.completionCriteria)) {
    failures.push("completion criteria is not observable");
  }
  // Achievable (small): a step that reads like a schedule grid is a plan
  // dressed up as a step, not a startable unit.
  if (looksLikeTimetable(`${step.title} ${step.why}`)) failures.push("step contains a timetable");
  // Startable: cue may be repaired when missing (see resolvePlanSteps), but a
  // clock-time cue is an invented schedule and disqualifies the step.
  if (CLOCK_TIME_PATTERN.test(step.startCue)) failures.push("start cue is a clock time");
  return failures;
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[\s:·,./-]+/g, "");
}

function duplicatesStep(candidate: PlanStep, existing: PlanStep): boolean {
  const a = normalizeTitle(candidate.title);
  const b = normalizeTitle(existing.title);
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

// The category follow-through: what naturally comes after the small first
// action of this kind of work. Derived from the item's own text, mirroring
// buildSemanticFallbackAction in overwhelmHeuristics.ts.
function buildFollowThroughStep(item: DetectedItem | null): PlanStep {
  const text = item ? itemSemanticText(item) : "";
  const label = item?.label ?? "이 일";
  if (looksLikeDebuggingItem(text)) {
    return {
      title: `${label}: 메모한 재현 조건대로 한 번 재현해 보기`,
      why: "막힌 지점을 눈으로 확인하면 고칠 범위가 정해져요.",
      startCue: "남긴 재현 메모 열기",
      completionCriteria: "재현 성공/실패 결과가 메모에 한 줄 남아 있으면 끝이에요.",
    };
  }
  if (looksLikeDeadlineOrExternalProject(text)) {
    return {
      title: `${label}: 고른 포인트 1개를 실제로 반영하기`,
      why: "포인트가 정해져 있으면 반영은 기계적으로 진행돼요.",
      startCue: "수정 메모와 원고 열기",
      completionCriteria: "수정된 문단이나 절 1개가 저장되어 있으면 끝이에요.",
    };
  }
  if (looksLikeRoutineLearningItem(text)) {
    return {
      title: `${label}: 골라 둔 항목 1개 실제로 복습하기`,
      why: "항목이 정해져 있으면 부담 없이 이어갈 수 있어요.",
      startCue: "골라 둔 항목 기록 열기",
      completionCriteria: "복습한 흔적이 기록에 남아 있으면 끝이에요.",
    };
  }
  return {
    title: `${label}: 적어 둔 조건에 맞춰 작은 결과물 1개 만들기`,
    why: "조건이 적혀 있으면 첫 결과물의 크기가 정해져요.",
    startCue: "적어 둔 조건 메모 열기",
    completionCriteria: "작은 결과물 1개가 실제로 남아 있으면 끝이에요.",
  };
}

// Deliberately label-free: it closes any plan by deferring the rest of the
// planning to the moment the previous step actually finished.
function buildClosingStep(): PlanStep {
  return {
    title: "다음 실행 단위 1개 정하기",
    why: "계획은 한 번에 다 세우지 않고, 끝낸 자리에서 다음 하나만 정해요.",
    startCue: "이 카드 다시 열기",
    completionCriteria: "다음에 할 스텝 1개가 메모로 남아 있으면 끝이에요.",
  };
}

// Step 0 is never the model's: it is the already-guard-validated recommended
// next action, so the plan's "start here" and the action card the user can
// save as a task are one and the same thing.
function buildFirstStep(nextAction: RecommendedNextAction, item: DetectedItem | null): PlanStep {
  return {
    title: nextAction.title,
    why: nextAction.reason || "지금 가장 작게 시작할 수 있는 일이에요.",
    startCue: defaultStartCueForItem(item),
    completionCriteria: nextAction.completionCriteria,
  };
}

// Fully deterministic plan for when the model gave no usable steps: the
// validated first action, its category follow-through, and the closing step.
export function buildFallbackPlanSteps(nextAction: RecommendedNextAction, item: DetectedItem | null): PlanStep[] {
  const first = buildFirstStep(nextAction, item);
  const followThrough = buildFollowThroughStep(item);
  const steps = [first];
  if (!duplicatesStep(followThrough, first)) steps.push(followThrough);
  steps.push(buildClosingStep());
  return steps;
}

// Repair-not-gate resolution of the model's plan_steps (SMART failures never
// become user-visible errors): step 0 is always rebuilt from the recommended
// next action; model steps that pass validation follow in their given order
// (a missing start cue or why is repaired from the item's category, a
// duplicate of an earlier step is dropped); when nothing usable remains, the
// deterministic fallback plan takes over. Returns [] only when there is no
// next action to anchor on — the caller then stores no plan.
export function resolvePlanSteps(
  modelSteps: PlanStep[],
  items: DetectedItem[],
  nextAction: RecommendedNextAction | null,
): PlanStep[] {
  if (!nextAction) return [];
  const chosen = chooseFirstItem(items);
  const first = buildFirstStep(nextAction, chosen);

  const accepted: PlanStep[] = [first];
  for (const raw of modelSteps) {
    if (accepted.length >= MAX_PLAN_STEPS) break;
    const step: PlanStep = {
      title: raw.title.trim(),
      why: raw.why.trim() || "앞 스텝의 결과를 그대로 이어받는 순서예요.",
      startCue: raw.startCue.trim() || defaultStartCueForItem(chosen),
      completionCriteria: raw.completionCriteria.trim(),
    };
    if (validatePlanStep(step).length > 0) continue;
    if (accepted.some((existing) => duplicatesStep(step, existing))) continue;
    accepted.push(step);
  }

  if (accepted.length === 1) return buildFallbackPlanSteps(nextAction, chosen).slice(0, MAX_PLAN_STEPS);
  return accepted;
}
