// Focus-session read-model selectors (pure, no React/IO) — see domain/tasks.
import type { FocusSession } from "../../types";

// Sessions created before the startedAt field existed only carry startAt.
export function focusSessionStartOf(session: FocusSession): string {
  return session.startedAt || session.startAt;
}

// Sessions started on or after sinceDate (YYYY-MM-DD), newest first.
export function selectRecentFocusSessions(sessions: FocusSession[], sinceDate: string): FocusSession[] {
  return [...sessions]
    .filter((session) => focusSessionStartOf(session).slice(0, 10) >= sinceDate)
    .sort((a, b) => focusSessionStartOf(b).localeCompare(focusSessionStartOf(a)));
}

// A session can only legitimately be "running" while the app instance that
// started it is open: `startAt` marks the open segment's start, and the
// displayed time is accumulatedSeconds + (now - startAt). So a running session
// arriving from storage, the account, or an import is stale by definition —
// the app was closed (or the row came from another device) with the timer
// going — and leaving it running bills an overnight quit as an 8-hour block.
//
// Recovery pauses it and credits only what the user had planned for
// (durationMinutes), so real work before the quit survives while the
// wall-clock runaway is capped.
export function recoverStaleFocusSessions(
  sessions: FocusSession[],
  nowMs = Date.now(),
): FocusSession[] {
  if (!sessions.some((session) => session.status === "running")) return sessions;
  const nowIso = new Date(nowMs).toISOString();

  return sessions.map((session): FocusSession => {
    if (session.status !== "running") return session;

    const startedMs = new Date(session.startAt).getTime();
    const elapsedSeconds = Number.isFinite(startedMs)
      ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
      : 0;
    const remainingPlannedSeconds = Math.max(
      0,
      session.durationMinutes * 60 - session.accumulatedSeconds,
    );
    const creditedSeconds = Math.min(elapsedSeconds, remainingPlannedSeconds);
    const closedAt =
      creditedSeconds > 0 ? new Date(startedMs + creditedSeconds * 1000).toISOString() : "";

    return {
      ...session,
      status: "paused",
      accumulatedSeconds: session.accumulatedSeconds + creditedSeconds,
      pausedAt: closedAt || session.startAt,
      segments: closedAt
        ? [...session.segments, { startAt: session.startAt, endAt: closedAt }]
        : session.segments,
      updatedAt: nowIso,
    };
  });
}
