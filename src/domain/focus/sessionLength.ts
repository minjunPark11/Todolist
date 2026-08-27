// How long a focus session is, and who decided (SETTINGS_REVIEW.md 4.5).
//
// `startFocusSession` takes a `durationMinutes` argument that no caller has ever
// passed, so every session's length came from an inference written inline in the
// hook: the task's own time span if it had one, and otherwise 50 minutes for a
// high-priority task and 30 for everything else. Those two numbers appear
// nowhere in the interface — a reader starting a session on a high task got 50
// minutes and no account of why.
//
// The chain has three links, most specific first:
//
//   1. what the caller asked for      — still nothing does, but the door stays
//   2. the task's own start/end span  — the reader already said when this runs
//   3. the reader's default           — this file's reason for existing
//
// `"auto"` is link 3's shipped value and keeps the 50/30 pair, so an account
// that never opens the setting sees exactly what it saw before. Choosing a
// number retires the heuristic for good.
import type { TaskPriority } from "../../types";

/** `"auto"` follows the task; a number is the reader's own default. */
export type FocusDefaultLength = "auto" | number;

/** The floor and ceiling a session has always been clamped to. */
export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 240;

/** What "auto" resolves to, unchanged from the inline inference. */
export const AUTO_HIGH_PRIORITY_MINUTES = 50;
export const AUTO_DEFAULT_MINUTES = 30;

/**
 * What the picker offers.
 *
 * 50 and 30 are in the list on purpose: they are what "auto" produces, so a
 * reader who wants one of them always can say so outright instead of relying on
 * a priority they may change for unrelated reasons.
 */
export const FOCUS_LENGTH_CHOICES: readonly FocusDefaultLength[] = [
  "auto",
  15,
  25,
  30,
  45,
  50,
  60,
  90,
];

/**
 * A stored or picked value made usable.
 *
 * Anything unrecognisable becomes `"auto"` — the same judgement `hoursAtATime`
 * makes for a value that never was, and here it also means an unreadable
 * setting cannot silently shorten someone's sessions.
 */
export function sanitizeFocusDefaultLength(value: unknown): FocusDefaultLength {
  if (value === "auto") return "auto";
  const minutes = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "auto";
  return Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(minutes)));
}

/** Minutes between two `HH:MM` wall-clock times, or 0 if that is not a span. */
function spanMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const start = new Date(`2000-01-01T${startTime}`).getTime();
  const end = new Date(`2000-01-01T${endTime}`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  // A non-positive span used to survive as a 1-minute session, because the
  // inline version clamped the difference instead of rejecting it. An end
  // before its start is broken data, not a one-minute intention.
  return Math.max(0, Math.round((end - start) / 60000));
}

export interface FocusLengthInput {
  /** What a caller asked for outright. Nothing passes this yet. */
  requestedMinutes?: number;
  startTime?: string;
  endTime?: string;
  priority?: TaskPriority;
  /** The reader's setting. */
  preference: FocusDefaultLength;
}

export function focusSessionMinutes({
  requestedMinutes,
  startTime = "",
  endTime = "",
  priority,
  preference,
}: FocusLengthInput): number {
  const chosen = sanitizeFocusDefaultLength(preference);
  const fallback =
    chosen === "auto"
      ? priority === "high"
        ? AUTO_HIGH_PRIORITY_MINUTES
        : AUTO_DEFAULT_MINUTES
      : chosen;

  const requested = Number(requestedMinutes);
  const minutes =
    Number.isFinite(requested) && requested > 0 ? requested : spanMinutes(startTime, endTime) || fallback;

  return Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(minutes)));
}
