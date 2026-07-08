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
