// Do two Schedules mean the same thing? (design §2.8, §2.28, §4.58)
//
// The editor asks this twice, for two different reasons:
//
//   dirty   — has the user changed anything? drives Confirm and the
//             discard-changes prompt
//   no-op   — would Confirm write anything? a save that changes nothing
//             should not bump `updatedAt` or push a sync (design §2.28)
//
// Field-by-field comparison answers neither correctly, because two records can
// differ in fields and agree in meaning: `startDate` null versus equal to
// `dueDate` are the same one-day schedule, and only one of them is canonical.
// So both questions are asked about the NORMALIZED pair.
import { normalizeSchedule } from "./normalizeSchedule";
import type { Schedule, ScheduleDraft } from "./types";

/**
 * True when both describe the same schedule.
 *
 * Normalized first, so the comparison is about meaning rather than shape —
 * `{startDate: "8/27", dueDate: "8/27"}` equals `{startDate: null, dueDate:
 * "8/27"}` because they put the task on the same day.
 *
 * `timezone` counts. Two identical wall-clock times in different zones are
 * different instants, and the reminder scheduler (Phase 11) will resolve them
 * to different moments.
 */
export function schedulesEqual(a: Schedule, b: Schedule): boolean {
  const left = normalizeSchedule(a);
  const right = normalizeSchedule(b);
  return (
    left.startDate === right.startDate &&
    left.dueDate === right.dueDate &&
    left.startTime === right.startTime &&
    left.endTime === right.endTime &&
    left.timezone === right.timezone &&
    left.reminder === right.reminder &&
    left.repeat === right.repeat
  );
}

/**
 * Has the draft moved away from what was opened? (design §2.8)
 *
 * `mode` is deliberately NOT compared. Switching to the Duration tab and back
 * without picking anything leaves the same schedule, and treating that as a
 * change would arm the discard prompt for a user who did nothing — §2.8 calls
 * the tab a view onto the draft, not part of it.
 *
 * The one case this makes subtle: an empty Duration tab reads as not-dirty
 * even though the user is visibly somewhere else. That is correct — there is
 * nothing to save from it (design §2.10).
 */
export function isDirty(draft: ScheduleDraft, saved: Schedule): boolean {
  return !schedulesEqual(draft, saved);
}
