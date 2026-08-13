import { describe, expect, it } from "vitest";
import { recoverStaleFocusSessions } from "./selectors";
import type { FocusSession } from "../../types";

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "focus-1",
    taskId: "task-1",
    title: "Write the report",
    mode: "focus",
    status: "running",
    durationMinutes: 25,
    accumulatedSeconds: 0,
    completed: false,
    startAt: "2026-08-12T22:00:00.000Z",
    endAt: "",
    startedAt: "2026-08-12T22:00:00.000Z",
    endedAt: "",
    pausedAt: "",
    segments: [],
    source: "focus_page",
    projectId: "",
    projectName: "",
    focusNote: "",
    createdAt: "2026-08-12T22:00:00.000Z",
    updatedAt: "2026-08-12T22:00:00.000Z",
    ...overrides,
  };
}

const startMs = Date.parse("2026-08-12T22:00:00.000Z");
const minutes = (n: number) => n * 60 * 1000;

describe("recoverStaleFocusSessions", () => {
  it("caps an overnight quit at the planned duration instead of billing wall-clock hours", () => {
    // The bug: a 25-minute timer left running while the app was closed for
    // nine hours reported nine hours of focus on next launch.
    const [recovered] = recoverStaleFocusSessions([session()], startMs + minutes(540));

    expect(recovered.status).toBe("paused");
    expect(recovered.accumulatedSeconds).toBe(25 * 60);
    expect(recovered.segments).toEqual([
      { startAt: "2026-08-12T22:00:00.000Z", endAt: "2026-08-12T22:25:00.000Z" },
    ]);
  });

  it("credits the real elapsed time when the quit was shorter than the plan", () => {
    const [recovered] = recoverStaleFocusSessions([session()], startMs + minutes(10));

    expect(recovered.accumulatedSeconds).toBe(10 * 60);
    expect(recovered.pausedAt).toBe("2026-08-12T22:10:00.000Z");
  });

  it("counts already-accumulated time against the planned budget", () => {
    // 20 of the 25 planned minutes were banked before the last resume, so at
    // most 5 more may be credited no matter how long the app was shut.
    const [recovered] = recoverStaleFocusSessions(
      [session({ accumulatedSeconds: 20 * 60 })],
      startMs + minutes(540),
    );

    expect(recovered.accumulatedSeconds).toBe(25 * 60);
  });

  it("never adds a zero-length segment when nothing can be credited", () => {
    const [recovered] = recoverStaleFocusSessions(
      [session({ accumulatedSeconds: 25 * 60 })],
      startMs + minutes(540),
    );

    expect(recovered.status).toBe("paused");
    expect(recovered.segments).toEqual([]);
  });

  it("survives an unparseable startAt without throwing", () => {
    const [recovered] = recoverStaleFocusSessions([session({ startAt: "not-a-date" })], startMs);

    expect(recovered.status).toBe("paused");
    expect(recovered.accumulatedSeconds).toBe(0);
    expect(recovered.segments).toEqual([]);
  });

  it("leaves paused and completed sessions untouched", () => {
    const input = [
      session({ id: "focus-paused", status: "paused", accumulatedSeconds: 300 }),
      session({ id: "focus-done", status: "completed", accumulatedSeconds: 1500 }),
    ];

    // Same array reference back: nothing to recover, so no re-render churn.
    expect(recoverStaleFocusSessions(input, startMs + minutes(540))).toBe(input);
  });
});
