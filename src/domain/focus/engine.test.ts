import { describe, expect, it } from "vitest";
import { emptyData, normalizeData } from "../plannerData/normalize";
import { DEFAULT_POMODORO, reduceFocus, type FocusCommand } from "./engine";
import { recoverStaleFocusSessions } from "./selectors";
import { focusRecords, recordedMs } from "./records";
import { unconfirmedFocusGap } from "./recovery";
import type { PlannerData } from "../../types";
const at = Date.parse("2026-09-06T10:00:00Z");
const minute = 60000;
const seed = () =>
  normalizeData({
    ...emptyData(),
    tasks: [
      { id: "a", title: "A", status: "todo", actualSeconds: 100 },
      { id: "b", title: "B", status: "todo", actualSeconds: 200 },
    ],
  });
let count = 0;
const step = (d: PlannerData, c: FocusCommand, t = at) =>
  reduceFocus(d, c, t, () => `id-${++count}`);
const start = (d = seed(), mode: "stopwatch" | "pomodoro" = "stopwatch") =>
  step(d, { type: "start", taskId: null, mode, settings: DEFAULT_POMODORO });
describe("focus recording contract", () => {
  it("allows normal background callbacks but flags sleep-sized gaps and clock changes", () => {
    expect(unconfirmedFocusGap(at,at+60000,0,60000)).toBe(false);
    expect(unconfirmedFocusGap(at,at+3600000,0,3600000)).toBe(true);
    expect(unconfirmedFocusGap(at,at-1000,0,1000)).toBe(true);
  });
  it("records unassigned work, reassigns contributions and makes retries harmless", () => {
    let d = start();
    const id = d.activeSessionId;
    d = step(d, { type: "finish", id }, at + 18 * minute);
    expect(d.focusSessions[0].taskId).toBeNull();
    expect(d.tasks[0].actualSeconds).toBe(100);
    d = step(d, { type: "link", id, taskId: "a" });
    expect(d.tasks[0].actualSeconds).toBe(1180);
    d = step(d, { type: "link", id, taskId: "a" });
    expect(d.tasks[0].actualSeconds).toBe(1180);
    d = step(d, { type: "link", id, taskId: "b" });
    expect(d.tasks.map((t) => t.actualSeconds)).toEqual([100, 1280]);
    d = step(d, { type: "link", id, taskId: null });
    expect(d.tasks.map((t) => t.actualSeconds)).toEqual([100, 200]);
    d = step(d, { type: "delete", id });
    const deleted = d;
    d = step(d, { type: "delete", id });
    expect(d).toBe(deleted);
  });
  it("excludes pauses and retains sub-second precision across segments", () => {
    let d = start();
    const id = d.activeSessionId;
    d = step(d, { type: "pause", id }, at + 10 * minute + 550);
    d = step(d, { type: "resume", id }, at + 15 * minute);
    d = step(d, { type: "finish", id }, at + 30 * minute + 550);
    expect(d.focusSessions[0].accumulatedSeconds).toBe(1501);
    expect(d.focusSessions[0].segments).toHaveLength(2);
  });
  it("rejects simultaneous starts including while paused", () => {
    let d = start();
    const id = d.activeSessionId;
    d = step(d, { type: "pause", id });
    expect(step(d, { type: "start", taskId: "a" })).toBe(d);
  });
  it("old commands cannot finish a newer session", () => {
    let d = start();
    const id = d.activeSessionId;
    d = step(d, { type: "finish", id }, at + minute);
    d = step(d, { type: "start", taskId: null }, at + 2 * minute);
    const next = d.activeSessionId;
    d = step(d, { type: "finish", id }, at + 3 * minute);
    expect(d.activeSessionId).toBe(next);
  });
  it("rejects stale record edits without resurrecting deletions", () => {
    let d = start();
    const id = d.activeSessionId;
    d = step(d, { type: "finish", id }, at + minute);
    expect(() =>
      step(d, { type: "link", id, taskId: "a", revision: 0 }),
    ).toThrow();
    d = step(d, { type: "delete", id });
    expect(step(d, { type: "link", id, taskId: "a" })).toBe(d);
  });
  it("ends at the pomodoro boundary exactly once and starts a separate break", () => {
    let d = start(seed(), "pomodoro");
    const id = d.activeSessionId;
    d = step(d, { type: "finish", id }, at + 25 * minute + 4000);
    expect(d.focusSessions).toHaveLength(1);
    expect(d.focusSessions[0].accumulatedSeconds).toBe(1500);
    expect(d.focusSessions[0].endReason).toBe("target_reached");
    expect(d.focusFlow?.phase).toBe("break_running");
    expect(d.focusFlow?.completedBlocks).toBe(1);
    expect(step(d, { type: "finish", id }, at + 25 * minute + 5000)).toBe(d);
  });
  it("manual early finish saves time without starting a break or counting a block", () => {
    let d = start(seed(), "pomodoro");
    d = step(d, { type: "finish", id: d.activeSessionId }, at + 12 * minute);
    expect(d.focusSessions[0].accumulatedSeconds).toBe(720);
    expect(d.focusFlow?.completedBlocks).toBe(0);
    expect(d.focusFlow?.phase).toBe("next_ready");
  });
  it("does not replay missing pomodoros after a long callback gap", () => {
    let d = start(seed(), "pomodoro");
    d = step(d, { type: "tick" }, at + 5 * 60 * minute);
    expect(d.focusSessions).toHaveLength(1);
    expect(d.focusFlow?.phase).toBe("break_ready");
  });
  it("manual break end waits even when auto-focus is enabled", () => {
    let d = step(seed(), {
      type: "start",
      taskId: null,
      mode: "pomodoro",
      settings: { ...DEFAULT_POMODORO, autoFocus: true },
    });
    d = step(d, { type: "tick" }, at + 25 * minute);
    d = step(d, { type: "break_end", id: d.focusFlow!.id }, at + 26 * minute);
    expect(d.focusFlow?.phase).toBe("next_ready");
    expect(d.activeSessionId).toBe("");
  });
  it("recovers 47 saved minutes without applying a 25-minute plan cap", () => {
    let d = start();
    d = step(d, { type: "checkpoint" }, at + 47 * minute);
    const [s] = recoverStaleFocusSessions(
      d.focusSessions,
      at + 4 * 60 * minute,
    );
    expect(s.accumulatedSeconds).toBe(47 * 60);
    expect(s.status).toBe("paused");
    expect(s.recoveryRequired).toBe(true);
  });
  it("splits midnight using the app timezone and counts unique sessions", () => {
    const startTime = Date.parse("2026-09-06T15:50:00Z");
    let d = step(seed(), { type: "start", taskId: null }, startTime);
    d = step(
      d,
      { type: "finish", id: d.activeSessionId },
      startTime + 20 * minute,
    );
    const s = d.focusSessions[0];
    expect(recordedMs(s, "2026-09-06", "2026-09-06", "Asia/Shanghai")).toBe(
      10 * minute,
    );
    expect(recordedMs(s, "2026-09-07", "2026-09-07", "Asia/Shanghai")).toBe(
      10 * minute,
    );
    expect(
      focusRecords(
        d.focusSessions,
        "2026-09-06",
        "2026-09-07",
        "Asia/Shanghai",
      ),
    ).toHaveLength(1);
  });
  it("uses the actual 23-hour DST day rather than adding 24 hours", () => {
    const begin = Date.parse("2026-03-08T05:00:00Z");
    let d = step(seed(), { type: "start", taskId: null }, begin);
    d = step(
      d,
      { type: "finish", id: d.activeSessionId },
      begin + 25 * 60 * minute,
    );
    expect(
      recordedMs(
        d.focusSessions[0],
        "2026-03-08",
        "2026-03-08",
        "America/New_York",
      ),
    ).toBe(23 * 60 * minute);
  });
  it("preserves legacy totals without inventing running segments", () => {
    const d = normalizeData({
      focusSessions: [
        {
          id: "legacy",
          status: "completed",
          accumulatedSeconds: 900,
          startedAt: new Date(at).toISOString(),
          endedAt: new Date(at + 30 * minute).toISOString(),
        },
      ],
    });
    expect(d.focusSessions[0].segments).toEqual([]);
    expect(d.focusSessions[0].accumulatedSeconds).toBe(900);
  });
});
