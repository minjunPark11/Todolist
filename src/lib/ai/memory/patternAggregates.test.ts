import { describe, it, expect } from "vitest";
import { computePatternAggregates, TIME_BUCKETS } from "./patternAggregates";
import type { AiTurnLogEntry } from "./turnLog";
import type { AiOutcomeLogEntry } from "./outcomeLog";
import type { InputSignals, ResponseMode } from "../assistant/types";
import type { AiSafeAction } from "../actions/types";

const NONE: InputSignals = {
  decisionSignal: "none",
  frictionSignal: "none",
  lowActionabilitySignal: "none",
  blockerSignal: "none",
  externalPressureSignal: "none",
  unscopedProjectSignal: "none",
};

function turn(overrides: Partial<AiTurnLogEntry> = {}): AiTurnLogEntry {
  return {
    id: overrides.id ?? `t-${Math.random().toString(16).slice(2)}`,
    source: "chat_assistant",
    userText: "u",
    assistantText: "a",
    responseMode: "normal_task_request",
    inputSignals: NONE,
    createdAt: "2026-07-09T14:00:00.000Z",
    ...overrides,
  };
}

function createTaskAction(id = "a1"): AiSafeAction {
  return { id, type: "create_task", label: "create", risk: "low", payload: { title: "x" } };
}

function outcome(overrides: Partial<AiOutcomeLogEntry> = {}): AiOutcomeLogEntry {
  return {
    id: overrides.id ?? `o-${Math.random().toString(16).slice(2)}`,
    assistantTurnId: "t-1",
    proposedAction: createTaskAction(),
    status: "proposed",
    createdAt: "2026-07-09T14:00:00.000Z",
    updatedAt: "2026-07-09T14:00:00.000Z",
    ...overrides,
  };
}

// Build an ISO timestamp at a fixed local hour so time-bucketing is testable
// regardless of the machine's timezone (Date.getHours is local time).
function atLocalHour(hour: number, day = 9): string {
  const d = new Date(2026, 6, day, hour, 0, 0); // July = month 6
  return d.toISOString();
}

describe("computePatternAggregates — corpus split", () => {
  it("counts assistant vs free-chat turns", () => {
    const agg = computePatternAggregates(
      [
        turn({ source: "assistant_panel" }),
        turn({ source: "chat_assistant" }),
        turn({ source: "chat_free", responseMode: undefined, inputSignals: undefined }),
      ],
      [],
    );
    expect(agg.totalTurns).toBe(3);
    expect(agg.assistantTurns).toBe(2);
    expect(agg.freeChatTurns).toBe(1);
  });

  it("returns fixed-length, fixed-order stuck buckets even with no data", () => {
    const agg = computePatternAggregates([], []);
    expect(agg.stuckByTime.map((b) => b.key)).toEqual([...TIME_BUCKETS]);
    expect(agg.stuckByWeekday.map((b) => b.key)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(agg.stuckByTime.every((b) => b.judged === 0 && b.stuck === 0 && b.ratio === 0)).toBe(true);
  });
});

describe("computePatternAggregates — stuck ratios", () => {
  it("buckets by local time of day and computes the stuck ratio", () => {
    const agg = computePatternAggregates(
      [
        turn({ createdAt: atLocalHour(8), responseMode: "overwhelm" }), // morning, stuck
        turn({ createdAt: atLocalHour(9), responseMode: "normal_task_request" }), // morning, not stuck
        turn({ createdAt: atLocalHour(14), responseMode: "normal_task_request", inputSignals: { ...NONE, frictionSignal: "strong" } }), // afternoon, stuck via friction
        turn({ createdAt: atLocalHour(23), responseMode: "normal_task_request" }), // night, not stuck
      ],
      [],
    );
    const morning = agg.stuckByTime.find((b) => b.key === "morning")!;
    expect(morning).toMatchObject({ judged: 2, stuck: 1, ratio: 0.5 });
    const afternoon = agg.stuckByTime.find((b) => b.key === "afternoon")!;
    expect(afternoon).toMatchObject({ judged: 1, stuck: 1, ratio: 1 });
    const night = agg.stuckByTime.find((b) => b.key === "night")!;
    expect(night).toMatchObject({ judged: 1, stuck: 0, ratio: 0 });
  });

  it("excludes free-chat turns (no responseMode) from the judged denominator", () => {
    const agg = computePatternAggregates(
      [
        turn({ createdAt: atLocalHour(9), responseMode: "overwhelm" }),
        turn({ createdAt: atLocalHour(9), source: "chat_free", responseMode: undefined, inputSignals: undefined }),
      ],
      [],
    );
    const morning = agg.stuckByTime.find((b) => b.key === "morning")!;
    expect(morning.judged).toBe(1);
    expect(morning.ratio).toBe(1);
  });

  it("buckets by weekday", () => {
    // 2026-07-09 is a Thursday (getDay() === 4).
    const agg = computePatternAggregates([turn({ createdAt: atLocalHour(10, 9), responseMode: "overwhelm" })], []);
    const thursday = agg.stuckByWeekday.find((b) => b.key === 4)!;
    expect(thursday).toMatchObject({ judged: 1, stuck: 1 });
  });

  it("skips turns with an unparseable timestamp", () => {
    const agg = computePatternAggregates([turn({ createdAt: "not-a-date", responseMode: "overwhelm" })], []);
    expect(agg.stuckByTime.every((b) => b.judged === 0)).toBe(true);
  });
});

describe("computePatternAggregates — domains", () => {
  it("counts domains across turns and orders by frequency then name", () => {
    const agg = computePatternAggregates(
      [
        turn({ domains: ["thesis", "coding"] }),
        turn({ domains: ["thesis"] }),
        turn({ domains: ["coding"] }),
        turn({ domains: ["thesis"] }),
      ],
      [],
    );
    expect(agg.topDomains).toEqual([
      { domain: "thesis", count: 3 },
      { domain: "coding", count: 2 },
    ]);
  });

  it("trims blanks and respects the topDomains limit", () => {
    const agg = computePatternAggregates(
      [turn({ domains: ["a", " ", "b", "c"] })],
      [],
      { topDomains: 2 },
    );
    expect(agg.topDomains).toHaveLength(2);
    expect(agg.topDomains.map((d) => d.domain)).not.toContain(" ");
  });
});

describe("computePatternAggregates — distributions", () => {
  it("tallies response modes and stages", () => {
    const agg = computePatternAggregates(
      [
        turn({ responseMode: "overwhelm", stage: "scoping" }),
        turn({ responseMode: "overwhelm", stage: "planned" }),
        turn({ responseMode: "planning_request", stage: "scoping" }),
      ],
      [],
    );
    expect(agg.responseModeCounts.overwhelm).toBe(2);
    expect(agg.responseModeCounts.planning_request).toBe(1);
    expect(agg.stageCounts.scoping).toBe(2);
    expect(agg.stageCounts.planned).toBe(1);
  });
});

describe("computePatternAggregates — acceptance", () => {
  it("computes overall acceptance rate excluding pending and failed", () => {
    const agg = computePatternAggregates(
      [],
      [
        outcome({ status: "saved_as_task" }),
        outcome({ status: "accepted" }),
        outcome({ status: "rejected" }),
        outcome({ status: "proposed" }), // pending — excluded from rate
        outcome({ status: "failed" }), // failed — excluded from rate
      ],
    );
    expect(agg.acceptance.overall).toMatchObject({ accepted: 2, rejected: 1, proposed: 1, failed: 1 });
    expect(agg.acceptance.overall.acceptanceRate).toBeCloseTo(2 / 3);
  });

  it("returns a 0 rate when nothing has been decided", () => {
    const agg = computePatternAggregates([], [outcome({ status: "proposed" })]);
    expect(agg.acceptance.overall.acceptanceRate).toBe(0);
  });

  it("breaks acceptance down by action type", () => {
    const splitAction: AiSafeAction = { id: "s", type: "split_task", label: "split", risk: "medium", payload: { taskId: "t", subtasks: ["a"] } };
    const agg = computePatternAggregates(
      [],
      [
        outcome({ status: "saved_as_task", proposedAction: createTaskAction() }),
        outcome({ status: "rejected", proposedAction: createTaskAction() }),
        outcome({ status: "accepted", proposedAction: splitAction }),
      ],
    );
    const create = agg.acceptance.byType.find((t) => t.type === "create_task")!;
    expect(create).toMatchObject({ accepted: 1, rejected: 1 });
    expect(create.acceptanceRate).toBe(0.5);
    const split = agg.acceptance.byType.find((t) => t.type === "split_task")!;
    expect(split).toMatchObject({ accepted: 1, rejected: 0, acceptanceRate: 1 });
  });

  it("joins outcomes back to the turn's response mode", () => {
    const agg = computePatternAggregates(
      [turn({ id: "t-overwhelm", responseMode: "overwhelm" }), turn({ id: "t-normal", responseMode: "normal_task_request" })],
      [
        outcome({ assistantTurnId: "t-overwhelm", status: "saved_as_task" }),
        outcome({ assistantTurnId: "t-overwhelm", status: "rejected" }),
        outcome({ assistantTurnId: "t-normal", status: "saved_as_task" }),
      ],
    );
    const overwhelm = agg.acceptance.byMode.find((m) => m.mode === "overwhelm")!;
    expect(overwhelm).toMatchObject({ accepted: 1, rejected: 1, acceptanceRate: 0.5 });
    const normal = agg.acceptance.byMode.find((m) => m.mode === "normal_task_request")!;
    expect(normal).toMatchObject({ accepted: 1, acceptanceRate: 1 });
  });

  it("ignores outcomes whose turn is not in the log for the byMode join", () => {
    const agg = computePatternAggregates([], [outcome({ assistantTurnId: "missing", status: "saved_as_task" })]);
    expect(agg.acceptance.byMode).toHaveLength(0);
    // ...but the overall/byType tallies still count it.
    expect(agg.acceptance.overall.accepted).toBe(1);
  });
});
