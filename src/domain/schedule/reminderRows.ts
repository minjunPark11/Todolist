// Reminder specs as stored rows, and back (spec §6.2, §6.3, §6.50).
//
// The seam between two shapes that deliberately differ. `ReminderSpec` is what
// a schedule means — four fields and no identity — and `Reminder` is what the
// store holds, with an id, a Task and timestamps. Keeping them apart is what
// lets the editor put a reminder in a draft that a cancel throws away: a spec
// costs nothing to abandon, a row would already have been written.
//
// This is also §6.50's command layer in its pure form. `planReminderRows`
// works out which rows to add and which to remove for a Task whose reminders
// have just been confirmed; the store applies the answer in one write, so a
// schedule edit and the reminders it implies land together or not at all.
import type { Reminder } from "../../types";
import { presetToSpec } from "./reminder";
import { sameReminder } from "./reminders";
import type { ReminderSpec } from "./types";

/** The rows belonging to one Task. */
export function remindersForTask(taskId: string, rows: readonly Reminder[]): Reminder[] {
  return rows.filter((row) => row.taskId === taskId);
}

/** A row read as what it means, dropping the identity the domain does not need. */
export function specOf(row: Reminder): ReminderSpec {
  return {
    type: row.type,
    offsetMinutes: row.offsetMinutes,
    absoluteAt: row.absoluteAt,
    allDayTime: row.allDayTime,
    enabled: row.enabled,
  };
}

export interface ReminderRowPlan {
  /** New rows to append. */
  added: Reminder[];
  /** Ids to drop. */
  removed: string[];
}

/**
 * What to write so this Task's rows say exactly `next` (§6.50).
 *
 * Rows that survive are LEFT ALONE rather than rewritten. That is not an
 * optimisation: a reminder's `createdAt` is when the user asked for it, and
 * rebuilding the list on every schedule edit would reset that — and, through
 * `reminderKey`, would make a reminder that has already fired eligible to fire
 * again.
 *
 * §6.16 holds here too: `next` is deduplicated on the way in, so two specs
 * that mean the same thing cannot produce two rows.
 */
export function planReminderRows(
  taskId: string,
  next: readonly ReminderSpec[],
  existing: readonly Reminder[],
  createId: () => string,
  now: string,
): ReminderRowPlan {
  const rows = remindersForTask(taskId, existing);
  const wanted: ReminderSpec[] = [];
  for (const spec of next) {
    if (!wanted.some((kept) => sameReminder(kept, spec))) wanted.push(spec);
  }

  const added: Reminder[] = [];
  for (const spec of wanted) {
    if (rows.some((row) => sameReminder(specOf(row), spec))) continue;
    added.push({
      id: createId(),
      taskId,
      type: spec.type,
      offsetMinutes: spec.offsetMinutes,
      absoluteAt: spec.absoluteAt,
      allDayTime: spec.allDayTime,
      enabled: spec.enabled,
      createdAt: now,
      updatedAt: now,
    });
  }

  const removed = rows
    .filter((row) => !wanted.some((spec) => sameReminder(spec, specOf(row))))
    .map((row) => row.id);

  return { added, removed };
}

/** A stored row this build can use, or null. */
export function sanitizeReminder(value: unknown): Reminder | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  // A reminder belonging to no Task can never fire and would sync forever
  // unseen — the same rule `sanitizeCheckItem` applies to an orphan line.
  if (!id || !taskId) return null;

  const type = record.type === "absolute" ? "absolute" : "relative";
  const offsetMinutes =
    typeof record.offsetMinutes === "number" && Number.isFinite(record.offsetMinutes)
      ? Math.max(0, Math.round(record.offsetMinutes))
      : null;
  const absoluteAt = typeof record.absoluteAt === "string" ? record.absoluteAt : null;
  // A relative reminder with no offset and an absolute one with no moment are
  // both rows that can never resolve to a time.
  if (type === "relative" && offsetMinutes === null) return null;
  if (type === "absolute" && !absoluteAt) return null;

  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<Reminder>), // M0 passthrough
    id,
    taskId,
    type,
    offsetMinutes: type === "relative" ? offsetMinutes : null,
    absoluteAt: type === "absolute" ? absoluteAt : null,
    allDayTime: typeof record.allDayTime === "string" ? record.allDayTime : null,
    // §6.40: absent means enabled. A row written before the field existed is a
    // reminder someone asked for, not one they switched off.
    enabled: record.enabled !== false,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

/**
 * Rows for Tasks whose reminder is still written as the retired preset (§6.3).
 *
 * Expand/migrate/contract, like the List membership and the workflow statuses
 * before it: the field stays on the Task, this reads it on load, and the next
 * write of that Task's schedule clears it. A Task that already has rows is
 * skipped — its preset is the stale copy, not the truth.
 *
 * Returns only the NEW rows, so a caller can tell whether anything changed and
 * leave the store object alone when nothing did.
 */
export function migrateReminders(
  tasks: ReadonlyArray<{ id: string; reminder?: string }>,
  existing: readonly Reminder[],
  createId: () => string,
  now: string,
): Reminder[] {
  const hasRows = new Set(existing.map((row) => row.taskId));
  const added: Reminder[] = [];

  for (const task of tasks) {
    if (hasRows.has(task.id)) continue;
    const spec = presetToSpec(task.reminder);
    if (!spec) continue;
    added.push({
      id: createId(),
      taskId: task.id,
      type: spec.type,
      offsetMinutes: spec.offsetMinutes,
      absoluteAt: spec.absoluteAt,
      allDayTime: spec.allDayTime,
      enabled: spec.enabled,
      createdAt: now,
      updatedAt: now,
    });
  }

  return added;
}

/**
 * Rows whose Task is gone, dropped.
 *
 * For the deletes that remove Tasks in bulk. Called with the Tasks that
 * SURVIVE, so it is a set difference and not a guess — and not run on load,
 * where a Task missing mid-sync is one that has not arrived yet.
 */
export function pruneOrphanReminders(
  tasks: ReadonlyArray<{ id: string }>,
  rows: readonly Reminder[],
): Reminder[] {
  const alive = new Set(tasks.map((task) => task.id));
  const kept = rows.filter((row) => alive.has(row.taskId));
  return kept.length === rows.length ? [...rows] : kept;
}
