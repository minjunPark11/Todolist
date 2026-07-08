import { describe, expect, it } from "vitest";
import type { DetectedItem } from "../contextCards/types";
import type { InputSignals } from "./types";
import {
  buildFallbackNextActionForItem,
  chooseFirstItem,
  containsGenericFailurePhrases,
  dedupeDetectedItems,
  isObservableOutput,
  isVagueCompletionCriteria,
  itemsHaveWorkTypeOrOutput,
  extractLikelyItemLabels,
  looksLikeTimetable,
  resolveResponseMode,
  shouldRouteToAssistantFlow,
  splitDumpFragments,
} from "./overwhelmHeuristics";

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
    label: "item",
    domain: "",
    workType: "",
    status: "",
    possibleOutput: "",
    dependency: false,
    externalPressure: false,
    ...overrides,
  };
}

describe("resolveResponseMode", () => {
  it("keeps a valid response_mode from the model as-is", () => {
    expect(resolveResponseMode("learning_request", NONE, 5)).toBe("learning_request");
  });

  it("does not classify multiple mentioned items as overwhelm when no signal is present", () => {
    // Section 16: mentioning several items alone must not trigger overwhelm.
    expect(resolveResponseMode(undefined, NONE, 3)).not.toBe("overwhelm");
  });

  it("classifies overwhelm when 2+ items and a strong friction signal", () => {
    expect(resolveResponseMode(undefined, { ...NONE, frictionSignal: "strong" }, 2)).toBe("overwhelm");
  });

  it("classifies overwhelm from a combination of weak signals, not a single one", () => {
    const oneWeak = resolveResponseMode(undefined, { ...NONE, decisionSignal: "weak" }, 2);
    expect(oneWeak).not.toBe("overwhelm");

    const twoWeak = resolveResponseMode(
      undefined,
      { ...NONE, decisionSignal: "weak", frictionSignal: "weak" },
      2,
    );
    expect(twoWeak).toBe("overwhelm");
  });

  it("classifies a single unscoped+low-actionability+friction item as overwhelm", () => {
    const signals: InputSignals = { ...NONE, unscopedProjectSignal: "strong", lowActionabilitySignal: "strong", frictionSignal: "strong" };
    expect(resolveResponseMode(undefined, signals, 1)).toBe("overwhelm");
  });

  it("treats a single large project without strong friction as planning_request, not overwhelm", () => {
    const signals: InputSignals = { ...NONE, unscopedProjectSignal: "weak" };
    expect(resolveResponseMode(undefined, signals, 1)).toBe("planning_request");
  });

  it("falls back to clarification_needed only when there are no items at all but friction is present", () => {
    expect(resolveResponseMode(undefined, { ...NONE, frictionSignal: "weak" }, 0)).toBe("clarification_needed");
  });

  it("defaults a single plain request to normal_task_request", () => {
    expect(resolveResponseMode(undefined, NONE, 1)).toBe("normal_task_request");
  });
});

describe("dedupeDetectedItems", () => {
  it("merges items that converge on the same possible_output within the same domain", () => {
    const items = [
      item({ label: "졸업논문", domain: "thesis", possibleOutput: "논문 초안 3장" }),
      item({ label: "문헌리뷰", domain: "thesis", possibleOutput: "논문 초안 3장" }),
      item({ label: "중국어 공부", domain: "language", possibleOutput: "단어 20개 복습 기록" }),
    ];
    const merged = dedupeDetectedItems(items);
    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.possibleOutput === "논문 초안 3장")?.label).toContain("졸업논문");
    expect(merged.find((entry) => entry.possibleOutput === "논문 초안 3장")?.label).toContain("문헌리뷰");
  });

  it("does not merge items with different possible_output just because nouns overlap", () => {
    const items = [
      item({ label: "비자 서류", domain: "admin", possibleOutput: "제출 서류 목록" }),
      item({ label: "코딩 에러", domain: "coding", possibleOutput: "재현 조건 기록" }),
    ];
    expect(dedupeDetectedItems(items)).toHaveLength(2);
  });

  it("ORs dependency/externalPressure flags when merging", () => {
    const items = [
      item({ label: "A", domain: "d", possibleOutput: "x", dependency: true }),
      item({ label: "B", domain: "d", possibleOutput: "x", externalPressure: true }),
    ];
    const [merged] = dedupeDetectedItems(items);
    expect(merged.dependency).toBe(true);
    expect(merged.externalPressure).toBe(true);
  });
});

describe("itemsHaveWorkTypeOrOutput", () => {
  it("is true when every item has a work_type or possible_output", () => {
    const items = [item({ workType: "writing" }), item({ possibleOutput: "checklist" })];
    expect(itemsHaveWorkTypeOrOutput(items)).toBe(true);
  });

  it("is false when any item has neither", () => {
    const items = [item({ workType: "writing" }), item({})];
    expect(itemsHaveWorkTypeOrOutput(items)).toBe(false);
  });
});

describe("chooseFirstItem", () => {
  it("returns null for an empty list", () => {
    expect(chooseFirstItem([])).toBeNull();
  });

  it("prioritizes an item that blocks another item's progress", () => {
    const blocker = item({ label: "blocker", dependency: true });
    const deadline = item({ label: "deadline", externalPressure: true });
    const plain = item({ label: "plain" });
    expect(chooseFirstItem([plain, deadline, blocker])?.label).toBe("blocker");
  });

  it("prioritizes an external-deadline item over a plain one when there is no blocker", () => {
    const deadline = item({ label: "deadline", externalPressure: true });
    const plain = item({ label: "plain" });
    expect(chooseFirstItem([plain, deadline])?.label).toBe("deadline");
  });
});

describe("isObservableOutput / isVagueCompletionCriteria", () => {
  it("rejects vague completion language", () => {
    expect(isObservableOutput("이해하면 완료")).toBe(false);
    expect(isObservableOutput("열심히 하면 완료")).toBe(false);
    expect(isObservableOutput("시간이 지나면 완료")).toBe(false);
    expect(isObservableOutput("")).toBe(false);
  });

  it("accepts an observable deliverable", () => {
    expect(isObservableOutput("체크리스트 항목 3개 작성됨")).toBe(true);
    expect(isObservableOutput("20 flashcards reviewed")).toBe(true);
  });

  it("isVagueCompletionCriteria is the negation of isObservableOutput", () => {
    expect(isVagueCompletionCriteria("기분이 나아지면 완료")).toBe(true);
    expect(isVagueCompletionCriteria("초안 1페이지 작성")).toBe(false);
  });
});

describe("looksLikeTimetable", () => {
  it("detects a generated schedule", () => {
    expect(looksLikeTimetable("9시 공부, 11시 논문, 오후 2시 코딩, 4시 복습")).toBe(true);
  });

  it("does not flag plain prose", () => {
    expect(looksLikeTimetable("논문 초안을 3장 작성하는 것을 먼저 해보세요")).toBe(false);
  });
});

describe("containsGenericFailurePhrases", () => {
  it("detects canned prioritize-yourself advice", () => {
    expect(containsGenericFailurePhrases("가장 시급한 것부터 처리하세요")).toBe(true);
    expect(containsGenericFailurePhrases("what would you like to focus on today?")).toBe(true);
  });

  it("does not flag a specific, item-grounded sentence", () => {
    expect(containsGenericFailurePhrases("졸업논문의 초안 3장을 먼저 작성해보세요")).toBe(false);
  });
});

describe("splitDumpFragments", () => {
  it("splits a Korean multi-obligation dump into fragments", () => {
    const fragments = splitDumpFragments("논문 피드백 반영, 앱 버그 수정, LeetCode 공부, 중국어 복습이 다 밀렸어");
    expect(fragments.length).toBeGreaterThanOrEqual(4);
  });
});

describe("extractLikelyItemLabels", () => {
  it("keeps only real work items, dropping the complaint and the question", () => {
    const labels = extractLikelyItemLabels(
      "해야 할 게 너무 많아서 시작을 못 하겠어. 논문 피드백 반영, 앱 버그 수정, LeetCode 공부, 중국어 복습이 다 밀렸어. 뭐부터 해야 해?",
    );
    expect(labels).toEqual(["논문 피드백 반영", "앱 버그 수정", "LeetCode 공부", "중국어 복습"]);
  });

  it("falls back to raw fragments when every fragment looks like noise", () => {
    const labels = extractLikelyItemLabels("너무 많아서 막막해");
    expect(labels.length).toBeGreaterThan(0);
  });
});

describe("shouldRouteToAssistantFlow", () => {
  it("routes the reported overwhelm input (friction + decision handoff)", () => {
    expect(
      shouldRouteToAssistantFlow(
        "해야 할 게 너무 많아서 시작을 못 하겠어. 논문 피드백 반영, 앱 버그 수정, LeetCode 공부, 중국어 복습이 다 밀렸어. 뭐부터 해야 해?",
      ),
    ).toBe(true);
  });

  it("routes an English overwhelm message", () => {
    expect(shouldRouteToAssistantFlow("I'm so overwhelmed — thesis feedback, app bugs, LeetCode. Where should I start?")).toBe(true);
  });

  it("does not route a plain multi-item status report with no friction or decision handoff", () => {
    expect(shouldRouteToAssistantFlow("오늘은 논문 피드백 반영하고, 앱 버그도 고치고, 중국어 복습도 했어")).toBe(false);
  });

  it("does not route a single scoped request even when a signal word appears", () => {
    expect(shouldRouteToAssistantFlow("막막해")).toBe(false);
    expect(shouldRouteToAssistantFlow("what should i do first")).toBe(false);
  });

  it("does not route an ordinary question", () => {
    expect(shouldRouteToAssistantFlow("이번 주 금요일에 일정 있어?")).toBe(false);
  });
});

describe("buildFallbackNextActionForItem", () => {
  it("builds a next action from the item's own possible_output when it is observable", () => {
    const target = item({ label: "졸업논문", possibleOutput: "초안 3장" });
    const action = buildFallbackNextActionForItem(target);
    expect(action.title).toContain("졸업논문");
    expect(action.title).toContain("초안 3장");
    expect(isObservableOutput(action.completionCriteria)).toBe(true);
  });

  it("falls back to a scope-reducing action when possible_output is missing or vague", () => {
    const target = item({ label: "새 프로젝트" });
    const action = buildFallbackNextActionForItem(target);
    expect(action.title).toContain("새 프로젝트");
    expect(isObservableOutput(action.completionCriteria)).toBe(true);
  });
});
