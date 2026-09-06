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

// A newly acquired host recovers persisted work through the last known checkpoint.
// Unobserved wall-clock gaps are excluded; a stopwatch has no planned-time cap.
export function recoverStaleFocusSessions(
  sessions: FocusSession[],
  nowMs = Date.now(),
): FocusSession[] {
  if (!sessions.some((session) => session.status === "running")) return sessions;
  const nowIso = new Date(nowMs).toISOString();

  return sessions.map((session): FocusSession => {
    if (session.status !== "running") return session;

    const startedMs = new Date(session.startAt).getTime();
    const checkpoint = Date.parse(session.checkpointAt ?? session.updatedAt);
    const creditedMs = Number.isFinite(startedMs) && Number.isFinite(checkpoint)
      ? Math.max(0, Math.min(nowMs, checkpoint) - startedMs) : 0;
    const creditedSeconds = creditedMs / 1000;
    const closedAt =
      creditedSeconds > 0 ? new Date(startedMs + creditedSeconds * 1000).toISOString() : "";

    return {
      ...session,
      status: "paused",
      accumulatedMs: (session.accumulatedMs ?? session.accumulatedSeconds * 1000) + creditedMs,
      accumulatedSeconds: Math.floor(((session.accumulatedMs ?? session.accumulatedSeconds * 1000) + creditedMs) / 1000),
      recoveryRequired: true,
      checkpointAt: closedAt || session.startAt,
      pausedAt: closedAt || session.startAt,
      segments: closedAt
        ? [...session.segments, { startAt: session.startAt, endAt: closedAt }]
        : session.segments,
      updatedAt: nowIso,
    };
  });
}
