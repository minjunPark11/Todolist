// What an edited occurrence of a repeating Task means on Google's side.
//
// RECURRING_OCCURRENCE_EDIT_DESIGN.md §7.2, M6. The mapping is not a new
// invention on either side — both models already have the vocabulary, and this
// is the sentence that translates one into the other:
//
//   app `recurrenceId`  →  google `originalStartTime`
//   app `occurrenceOf`  →  google `recurringEventId`
//   app `exdates`       →  that instance, `cancelled`
//
// The urgent half is `isOccurrenceTask`. M3 started writing occurrence rows,
// and an occurrence row looks exactly like an ordinary dated task to
// `isSyncEligible` — so the plain outbound path would create a SECOND event
// for it while the series' own RRULE still draws the original date. The same
// occurrence twice, on two days, is worse than not syncing it at all.
//
// The verified-mapping dispatch is now in lib/googleOccurrenceSync.ts and the
// server reservation path (037). These early address helpers are not used by
// that path: it must derive the original START from the mapped Google base,
// distinguishing all-day dates and timed instances instead of using midnight.
import type { Task } from "../../../types";

/**
 * Is this record one occurrence of a series rather than a task of its own?
 *
 * Both fields, not either. `recurrenceId` alone could be a leftover from a
 * series that has since been deleted, and such a record is on its own now —
 * `resolveOccurrence` reaches the same conclusion for the same reason.
 */
export function isOccurrenceTask(task: Pick<Task, "recurrenceId" | "occurrenceOf">): boolean {
  return Boolean(task.recurrenceId) && Boolean(task.occurrenceOf);
}

export interface OccurrenceOutboundInput {
  /** The occurrence's row. Materialised by M3, or the completion snapshot of M1. */
  occurrence: Task;
  /** Its series, as the app holds it. */
  series: Pick<Task, "id" | "googleEventId"> | null;
  /** The connection's zone, for turning a date into the instant Google matches on. */
  timezone: string;
}

export type OccurrenceOutbound =
  /**
   * Patch the one instance. `masterEventId` + `originalStart` is the address;
   * `lib/googleCalendarInstance` turns it into the instance's own id, exactly
   * as it does for an external occurrence (§7.1) — one lookup, two callers.
   */
  | { kind: "override"; masterEventId: string; originalStart: string }
  /** Nothing to do yet, and nothing may be created either. */
  | { kind: "hold"; reason: "series-not-synced" | "series-missing" | "no-occurrence-date" };

/**
 * How to write one occurrence.
 *
 * Never "create". A series that Google already draws from an RRULE has the
 * occurrence in it; adding a standalone event for the same one is the
 * duplication this whole module exists to prevent. Until the series has an
 * event to hang an override on, the answer is to wait.
 */
export function planOccurrenceOutbound(input: OccurrenceOutboundInput): OccurrenceOutbound {
  const { occurrence, series, timezone } = input;
  if (!occurrence.recurrenceId) return { kind: "hold", reason: "no-occurrence-date" };
  if (!series) return { kind: "hold", reason: "series-missing" };
  if (!series.googleEventId) return { kind: "hold", reason: "series-not-synced" };

  return {
    kind: "override",
    masterEventId: series.googleEventId,
    // Where the occurrence WAS, as an instant in the connection's zone. Google
    // matches `originalStartTime`, and a date alone would be ambiguous by up to
    // a day either side of it.
    originalStart: startOfDayIn(occurrence.recurrenceId, timezone),
  };
}

/**
 * The instances a series wants cancelled — its skipped dates (§6.2).
 *
 * Returned as the same address shape, because cancelling an instance is a
 * write to that instance and not to the series: Google has no "EXDATE" field on
 * an event, it has an instance whose status is `cancelled`.
 */
export function planSkippedInstances(
  series: Pick<Task, "googleEventId" | "exdates">,
  timezone: string,
): { masterEventId: string; originalStart: string }[] {
  if (!series.googleEventId) return [];
  return (series.exdates ?? []).map((date) => ({
    masterEventId: series.googleEventId as string,
    originalStart: startOfDayIn(date, timezone),
  }));
}

/**
 * Midnight on `date` in `timezone`, as an RFC3339 instant.
 *
 * The same problem `resolveMinute` solves for the task outbound, and solved the
 * same careful way: format the guess in the zone, read the difference back, and
 * only accept a candidate that round-trips. A zone's offset is not a constant,
 * and assuming one is how an occurrence lands a day out twice a year.
 */
export function startOfDayIn(date: string, timezone: string): string {
  const wall = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(wall)) return "";
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
  } catch {
    return "";
  }
  const readBack = (ms: number) => {
    const parts = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, part.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  // Midnight is the wall time most likely to fall in a DST gap, so a candidate
  // that does not read back as the time asked for is rejected rather than
  // nudged — the caller holding "" is better than an instant off by an hour.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const candidate = wall - (readBack(sample) - sample);
    if (readBack(candidate) === wall) return new Date(candidate).toISOString();
  }
  return "";
}
