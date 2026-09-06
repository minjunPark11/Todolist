import type { FocusSession } from "../../types";

export function focusDate(ms: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Find a date boundary in instant space, including 23/25-hour DST days. */
function nextBoundary(ms: number, timezone: string): number {
  const date = focusDate(ms, timezone);
  let lo = ms,
    hi = ms + 48 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((hi + lo) / 2);
    if (focusDate(mid, timezone) === date) lo = mid;
    else hi = mid;
  }
  return hi;
}
export function recordedMs(
  session: FocusSession,
  from: string,
  to: string,
  timezone: string,
): number {
  if (session.status !== "completed" || session.mode !== "focus") return 0;
  let sum = 0;
  for (const segment of session.segments) {
    let cursor = Date.parse(segment.startAt);
    const end = Date.parse(segment.endAt);
    if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor)
      continue;
    while (cursor < end) {
      const date = focusDate(cursor, timezone);
      if (date > to) break;
      const partEnd = Math.min(end, nextBoundary(cursor, timezone));
      if (date >= from) sum += partEnd - cursor;
      cursor = partEnd;
    }
  }
  return sum;
}
export function focusRecords(
  sessions: FocusSession[],
  from: string,
  to: string,
  timezone: string,
  taskFilter = "all",
) {
  return sessions
    .filter(
      (s) =>
        s.status === "completed" &&
        s.mode === "focus" &&
        (taskFilter === "all" ||
          (taskFilter === "unassigned"
            ? s.taskId === null || s.taskId === ""
            : s.taskId === taskFilter)),
    )
    .map((session) => ({
      session,
      ms: recordedMs(session, from, to, timezone),
    }))
    .filter(
      ({ session, ms }) =>
        ms > 0 ||
        (!session.segments.length &&
          focusDate(
            Date.parse(session.endedAt || session.startedAt),
            timezone,
          ) >= from &&
          focusDate(
            Date.parse(session.endedAt || session.startedAt),
            timezone,
          ) <= to),
    )
    .sort(
      (a, b) =>
        (b.session.endedAt || b.session.endAt).localeCompare(
          a.session.endedAt || a.session.endAt,
        ) || a.session.id.localeCompare(b.session.id),
    );
}
