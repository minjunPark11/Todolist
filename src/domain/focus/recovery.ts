import type { PlannerData } from "../../types";
import { recoverStaleFocusSessions } from "./selectors";

// This is a conservative uncertainty threshold, not a claim to detect OS sleep.
// Ordinary background throttling (including a minute between callbacks) is allowed.
export const UNCONFIRMED_FOCUS_GAP_MS = 5 * 60 * 1000;
export function unconfirmedFocusGap(previousWall: number, now: number, previousMono: number, mono: number) {
  const wall = now - previousWall, steady = mono - previousMono;
  return wall < 0 || wall > UNCONFIRMED_FOCUS_GAP_MS || Math.abs(wall - steady) > 5000;
}
export function recoverFocusData(data: PlannerData, now = Date.now()): PlannerData {
  const focusSessions = recoverStaleFocusSessions(data.focusSessions, now);
  const flow = data.focusFlow;
  const focusFlow = flow?.phase === "break_running" ? { ...flow, phase: "break_paused" as const, revision: flow.revision + 1,
    breakElapsedMs: Math.min(flow.breakSeconds * 1000, flow.breakElapsedMs + Math.max(0, Math.min(now, Date.parse(flow.checkpointAt)) - Date.parse(flow.startedAt))) } : flow;
  return focusSessions === data.focusSessions && focusFlow === flow ? data : { ...data, focusSessions, focusFlow };
}
