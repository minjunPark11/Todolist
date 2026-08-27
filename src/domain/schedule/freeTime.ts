// The complement of a day's commitments.
//
// New, and the only genuinely new calculation the server layer needed: the app
// draws a day and lets a person see the gaps, so nothing ever had to name one.
// A reader with no eyes does — "what can I finish before my next meeting?" is
// not answerable from a list of events, only from the holes between them.
//
// Pure minute arithmetic, in the user's own wall clock. It lives in the domain
// rather than in the server layer because it is a fact about a day, and a
// screen that ever wants to show free time should read the same one.

/** Half-open [start, end) in minutes since local midnight. */
export interface MinuteSpan {
  start: number;
  end: number;
}

/**
 * Overlapping and touching spans joined into as few as possible.
 *
 * Touching ones are joined too (09:00–10:00 and 10:00–11:00 become one): a
 * zero-length gap is not a gap anybody can use, and leaving it in would make
 * "you are free from 10:00 to 10:00" a possible answer.
 */
export function mergeSpans(spans: MinuteSpan[]): MinuteSpan[] {
  const valid = spans.filter((span) => span.end > span.start).sort((a, b) => a.start - b.start);
  const merged: MinuteSpan[] = [];
  for (const span of valid) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

/**
 * What is left of `[dayStart, dayEnd)` once `busy` is taken out.
 *
 * `minimumMinutes` drops slivers: a four-minute hole between two meetings is
 * arithmetically free and practically not, and listing it invites a reader to
 * suggest filling it.
 */
export function freeSpans(
  busy: MinuteSpan[],
  dayStart: number,
  dayEnd: number,
  minimumMinutes = 0,
): MinuteSpan[] {
  if (dayEnd <= dayStart) return [];
  const free: MinuteSpan[] = [];
  let cursor = dayStart;

  for (const span of mergeSpans(busy)) {
    if (span.end <= dayStart) continue;
    if (span.start >= dayEnd) break;
    const start = Math.max(span.start, dayStart);
    if (start > cursor) free.push({ start: cursor, end: start });
    cursor = Math.max(cursor, Math.min(span.end, dayEnd));
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });

  return free.filter((span) => span.end - span.start >= minimumMinutes);
}

/**
 * Minutes from `fromMinute` until the next commitment starts, or until
 * `dayEnd` when nothing is left today.
 *
 * Undefined while a commitment is in progress: the honest answer to "how long
 * until your next thing" during a meeting is not a number of minutes of free
 * time, and returning 0 would read as "you are free right now, for no time".
 */
export function freeMinutesFrom(
  busy: MinuteSpan[],
  fromMinute: number,
  dayEnd: number,
): number | undefined {
  for (const span of mergeSpans(busy)) {
    if (span.start <= fromMinute && span.end > fromMinute) return undefined;
    if (span.start > fromMinute) return Math.max(0, Math.min(span.start, dayEnd) - fromMinute);
  }
  return Math.max(0, dayEnd - fromMinute);
}

export function formatMinuteSpan(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minute)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
