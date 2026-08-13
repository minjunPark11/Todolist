import { describe, expect, it } from "vitest";
import type { DetectedItem, InfoSlot } from "../contextCards/types";
import {
  assumeUnresolvedSlots,
  chooseNextSlotToAsk,
  deriveInfoSlots,
  isSlotResolved,
  mergeInfoSlots,
  resolveCardStage,
  SLOT_PRIORITY,
} from "./infoSlots";

function item(overrides: Partial<DetectedItem> = {}): DetectedItem {
  return {
    label: "논문 피드백 반영",
    domain: "",
    workType: "",
    status: "",
    possibleOutput: "",
    dependency: false,
    externalPressure: false,
    ...overrides,
  };
}

function slot(kind: InfoSlot["kind"], overrides: Partial<InfoSlot> = {}): InfoSlot {
  return { kind, question: `q-${kind}`, answer: "", ...overrides };
}

describe("deriveInfoSlots", () => {
  it("creates one slot per kind, anchored on the priority item's label", () => {
    const slots = deriveInfoSlots([item({ label: "중국어 복습" }), item({ label: "논문 피드백 반영" })]);
    expect(slots.map((entry) => entry.kind)).toEqual([...SLOT_PRIORITY]);
    // The question anchors on the item the priority heuristic would start
    // with (논문 피드백 반영), not the first-mentioned one.
    expect(slots[0].question).toContain("논문 피드백 반영");
  });

  it("resolves done_criteria from an observable possible_output and blocked_point from a stated status", () => {
    const slots = deriveInfoSlots([item({ possibleOutput: "수정 메모 3줄", status: "stuck" })]);
    const done = slots.find((entry) => entry.kind === "done_criteria");
    const blocked = slots.find((entry) => entry.kind === "blocked_point");
    expect(done?.answer).toBe("수정 메모 3줄");
    expect(done?.source).toBe("derived");
    expect(blocked?.answer).toBe("stuck");
  });

  it("leaves slots unresolved for a label-only item", () => {
    const slots = deriveInfoSlots([item()]);
    expect(slots.every((entry) => !isSlotResolved(entry))).toBe(true);
  });
});

describe("mergeInfoSlots", () => {
  it("keeps a resolved slot resolved when a later turn omits or blanks it", () => {
    const previous = [slot("deadline", { answer: "금요일 제출", source: "user_answer" })];
    const incoming = [slot("deadline")];
    const merged = mergeInfoSlots(previous, incoming);
    expect(merged.find((entry) => entry.kind === "deadline")?.answer).toBe("금요일 제출");
  });

  it("never lets a weaker source overwrite a user answer", () => {
    const previous = [slot("time_budget", { answer: "하루 1시간", source: "user_answer" })];
    const incoming = [slot("time_budget", { answer: "하루 15~30분 기준으로 가정", source: "assumed_default" })];
    const merged = mergeInfoSlots(previous, incoming);
    expect(merged.find((entry) => entry.kind === "time_budget")?.answer).toBe("하루 1시간");
  });

  it("lets a fresh user answer replace a derived or assumed one", () => {
    const previous = [slot("done_criteria", { answer: "작은 산출물 1개가 남으면 완료로 가정", source: "assumed_default" })];
    const incoming = [slot("done_criteria", { answer: "피드백 반영된 절 1개", source: "user_answer" })];
    const merged = mergeInfoSlots(previous, incoming);
    expect(merged.find((entry) => entry.kind === "done_criteria")?.answer).toBe("피드백 반영된 절 1개");
  });

  it("keeps one slot per kind in priority order", () => {
    const merged = mergeInfoSlots(
      [slot("scope_boundary"), slot("done_criteria")],
      [slot("deadline"), slot("done_criteria", { answer: "x", source: "derived" })],
    );
    expect(merged.map((entry) => entry.kind)).toEqual(["done_criteria", "deadline", "scope_boundary"]);
  });
});

describe("chooseNextSlotToAsk", () => {
  it("returns the highest-priority unresolved slot", () => {
    const slots = [
      slot("done_criteria", { answer: "초안 절 1개", source: "user_answer" }),
      slot("deadline"),
      slot("blocked_point"),
    ];
    expect(chooseNextSlotToAsk(slots)?.kind).toBe("deadline");
  });

  it("returns null when everything is resolved", () => {
    const slots = [slot("done_criteria", { answer: "a", source: "derived" }), slot("deadline", { answer: "b", source: "user_answer" })];
    expect(chooseNextSlotToAsk(slots)).toBeNull();
  });
});

describe("assumeUnresolvedSlots", () => {
  it("fills every open slot with a stated assumption and leaves answers intact", () => {
    const slots = [slot("deadline"), slot("done_criteria", { answer: "절 1개", source: "user_answer" })];
    const assumed = assumeUnresolvedSlots(slots);
    expect(assumed.every(isSlotResolved)).toBe(true);
    expect(assumed.find((entry) => entry.kind === "deadline")?.source).toBe("assumed_default");
    expect(assumed.find((entry) => entry.kind === "done_criteria")?.answer).toBe("절 1개");
  });
});

describe("resolveCardStage", () => {
  const nextAction = { title: "t", reason: "r", completionCriteria: "c" };

  it("is goal_captured with no items", () => {
    expect(resolveCardStage({ detectedItemDetails: [], infoSlots: [], recommendedNextAction: nextAction })).toBe("goal_captured");
  });

  it("is scoping while done_criteria is unresolved", () => {
    expect(resolveCardStage({ detectedItemDetails: [item()], infoSlots: deriveInfoSlots([item()]), recommendedNextAction: nextAction })).toBe(
      "scoping",
    );
  });

  it("is info_gathering when done is defined but deadline/blocked_point are open", () => {
    const slots = [slot("done_criteria", { answer: "절 1개", source: "user_answer" }), slot("deadline"), slot("blocked_point")];
    expect(resolveCardStage({ detectedItemDetails: [item()], infoSlots: slots, recommendedNextAction: nextAction })).toBe("info_gathering");
  });

  it("is planned only when required slots are resolved AND a next action exists", () => {
    const slots = [
      slot("done_criteria", { answer: "절 1개", source: "user_answer" }),
      slot("deadline", { answer: "명시된 마감 없음으로 가정", source: "assumed_default" }),
      slot("blocked_point", { answer: "아직 시작 전으로 가정", source: "assumed_default" }),
    ];
    expect(resolveCardStage({ detectedItemDetails: [item()], infoSlots: slots, recommendedNextAction: nextAction })).toBe("planned");
    expect(resolveCardStage({ detectedItemDetails: [item()], infoSlots: slots, recommendedNextAction: undefined })).toBe("info_gathering");
  });

  it("optional slots (time_budget, scope_boundary, prerequisite) never gate the stage", () => {
    const slots = [
      slot("done_criteria", { answer: "a", source: "derived" }),
      slot("deadline", { answer: "b", source: "derived" }),
      slot("blocked_point", { answer: "c", source: "derived" }),
      slot("time_budget"),
      slot("scope_boundary"),
      slot("prerequisite"),
    ];
    expect(resolveCardStage({ detectedItemDetails: [item()], infoSlots: slots, recommendedNextAction: nextAction })).toBe("planned");
  });
});
