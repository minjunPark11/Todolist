// Deterministic info-gathering layer for the goal→execution pipeline
// (slice 2 of the stuck-to-execution vision). Same philosophy as
// overwhelmHeuristics.ts: the model proposes slot answers via prompts.ts,
// these pure functions decide what is actually still unknown, which single
// question to ask next, and which stage the card is in. Nothing here asks
// the user anything by itself, and nothing blocks execution: every slot can
// be resolved by a safe assumed default instead of an answer.
import type { CardStage, ContextCardDraft, DetectedItem, InfoSlot, InfoSlotKind, InfoSlotSource } from "../contextCards/types";
import { chooseFirstItem, isObservableOutput } from "./overwhelmHeuristics";

// Ordered by how much the answer changes the plan: the done criteria shapes
// the whole decomposition, a deadline reorders it, the blocked point changes
// whether the first action is "start", "resume", or "record".
export const SLOT_PRIORITY: readonly InfoSlotKind[] = [
  "done_criteria",
  "deadline",
  "blocked_point",
  "prerequisite",
  "time_budget",
  "scope_boundary",
];

// Slots that must be resolved (answered or assumed) before the card can
// leave info gathering. The rest are nice-to-have and never gate a stage.
const REQUIRED_SLOT_KINDS: readonly InfoSlotKind[] = ["done_criteria", "deadline", "blocked_point"];

const SOURCE_RANK: Record<InfoSlotSource, number> = {
  user_answer: 3,
  derived: 2,
  assumed_default: 1,
};

export function isSlotResolved(slot: InfoSlot): boolean {
  return slot.answer.trim() !== "";
}

function sourceRank(slot: InfoSlot): number {
  if (!isSlotResolved(slot)) return 0;
  return slot.source ? SOURCE_RANK[slot.source] : SOURCE_RANK.derived;
}

// Generic per-kind question templates, anchored on the card's first-priority
// item so the question names the actual work. Deliberately not per-case
// canned sentences — the label is the only input-specific part.
function questionForKind(kind: InfoSlotKind, label: string): string {
  switch (kind) {
    case "done_criteria":
      return `"${label}"이(가) 끝났다는 건 어떤 산출물이 남아 있는 상태인가요?`;
    case "deadline":
      return `"${label}"에 제출일이나 피드백 받기로 한 날짜가 있나요?`;
    case "blocked_point":
      return `"${label}"에서 마지막으로 시도한 것과 멈춘 지점이 어디인가요?`;
    case "prerequisite":
      return `"${label}"을(를) 진행하려면 먼저 있어야 하는 것(자료, 답장, 환경)이 있나요?`;
    case "time_budget":
      return `이번 주에 "${label}"에 쓸 수 있는 시간이 대략 얼마나 되나요?`;
    case "scope_boundary":
      return `"${label}"은(는) 이번에 어디까지만 하면 되나요?`;
  }
}

// Safe defaults so info gathering can always be short-circuited ("그냥
// 진행해줘") instead of becoming a gate that blocks execution.
export function defaultAssumptionForKind(kind: InfoSlotKind): string {
  switch (kind) {
    case "done_criteria":
      return "작은 산출물 1개가 남으면 완료로 가정";
    case "deadline":
      return "명시된 마감 없음으로 가정";
    case "blocked_point":
      return "아직 시작 전으로 가정";
    case "prerequisite":
      return "선행 조건 없음으로 가정";
    case "time_budget":
      return "하루 15~30분 기준으로 가정";
    case "scope_boundary":
      return "이번에는 실행 단위 1개까지로 한정";
  }
}

// Builds the slot set for a card from its own detected items, resolving what
// the card fields already answer (observable possible_output → done
// criteria, a stated status → blocked point). Anchored on the same item the
// priority heuristic would start with, so questions and the recommended
// action point at the same work.
export function deriveInfoSlots(items: DetectedItem[]): InfoSlot[] {
  const primary = chooseFirstItem(items);
  const label = primary?.label ?? "이 일";

  return SLOT_PRIORITY.map((kind) => {
    const slot: InfoSlot = { kind, question: questionForKind(kind, label), answer: "" };
    if (!primary) return slot;
    if (kind === "done_criteria" && isObservableOutput(primary.possibleOutput)) {
      return { ...slot, answer: primary.possibleOutput.trim(), source: "derived" as const };
    }
    if (kind === "blocked_point" && primary.status.trim()) {
      return { ...slot, answer: primary.status.trim(), source: "derived" as const };
    }
    return slot;
  });
}

// Merge rule: one slot per kind; a resolved slot never reopens because the
// model omitted it on a later turn, and an answer is only replaced by one
// from an equal-or-stronger source (user_answer > derived > assumed_default).
export function mergeInfoSlots(previous: InfoSlot[], incoming: InfoSlot[]): InfoSlot[] {
  const byKind = new Map<InfoSlotKind, InfoSlot>();
  for (const slot of previous) {
    if (!byKind.has(slot.kind)) byKind.set(slot.kind, { ...slot });
  }
  for (const slot of incoming) {
    const existing = byKind.get(slot.kind);
    if (!existing) {
      byKind.set(slot.kind, { ...slot });
      continue;
    }
    if (isSlotResolved(slot) && sourceRank(slot) >= sourceRank(existing)) {
      byKind.set(slot.kind, { ...slot, question: existing.question || slot.question });
    }
  }
  return SLOT_PRIORITY.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind) as InfoSlot);
}

// The single next question worth asking: highest-priority unresolved slot.
// Callers enforce the "at most 1 question per turn" rule that already
// applies to overwhelm responses.
export function chooseNextSlotToAsk(slots: InfoSlot[]): InfoSlot | null {
  for (const kind of SLOT_PRIORITY) {
    const slot = slots.find((entry) => entry.kind === kind);
    if (slot && !isSlotResolved(slot)) return slot;
  }
  return null;
}

// Escape hatch for "그냥 진행해줘": resolve every open slot with its safe
// default so the card can advance to planning immediately.
export function assumeUnresolvedSlots(slots: InfoSlot[]): InfoSlot[] {
  return slots.map((slot) =>
    isSlotResolved(slot) ? slot : { ...slot, answer: defaultAssumptionForKind(slot.kind), source: "assumed_default" as const },
  );
}

// Deterministic stage resolver — the model never decides the stage.
//   goal_captured   nothing usable detected yet
//   scoping         items exist but "done" is still undefined
//   info_gathering  done is defined, other required slots still open
//   planned         required slots resolved AND a next action exists
// "executing" is assigned by the execution slice (task created / focus
// session started), never by this resolver.
export function resolveCardStage(draft: Pick<ContextCardDraft, "detectedItemDetails" | "infoSlots" | "recommendedNextAction">): CardStage {
  const items = draft.detectedItemDetails ?? [];
  if (items.length === 0) return "goal_captured";

  const slots = draft.infoSlots ?? [];
  const resolvedKinds = new Set(slots.filter(isSlotResolved).map((slot) => slot.kind));
  if (!resolvedKinds.has("done_criteria")) return "scoping";
  if (!REQUIRED_SLOT_KINDS.every((kind) => resolvedKinds.has(kind))) return "info_gathering";
  return draft.recommendedNextAction ? "planned" : "info_gathering";
}
