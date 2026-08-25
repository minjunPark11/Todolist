// What has happened to a Task (spec §25.7, §15.59).
//
// §25.7 asks for a history surface behind More, and sketches a
// `TaskActivityEvent` row — marked in that same section as OUR DESIGN
// DECISION rather than as anything measured about TickTick. This does not
// build that table, and the reason is worth stating plainly rather than
// leaving as an omission.
//
// This app syncs by diffing the WHOLE snapshot (Ch. 26 §26.8.1). An event log
// written by every mutation would grow that snapshot without bound, on every
// edit, with no retention rule and no screen to prune it from — so adding one
// is a model change of the same size as the Reminder work Phase 3 deferred,
// not a surface that can be hung off a menu item.
//
// What the store DOES already hold is a set of timestamps, and they are real
// records rather than reconstructions: when the Task was made, finished,
// given up on, thrown away, pinned, and every focus session ever run against
// it. That is the history this returns.
//
// The limit, said out loud: field-level changes are not here. "Title changed
// from A to B" and "moved from Inbox to Work" need the log, because the store
// keeps only the value a field has now. Everything below is something that
// was written down at the time.
import type { CheckItem, FocusSession, Task } from "../../types";

export type TaskActivityKind =
  | "created"
  | "updated"
  | "completed"
  | "wontDo"
  | "trashed"
  | "pinned"
  | "focus"
  | "checkItem";

export interface TaskActivityEntry {
  /** Stable across renders — derived from what it describes, never generated. */
  id: string;
  kind: TaskActivityKind;
  /** ISO timestamp. */
  at: string;
  /**
   * The part of the entry that is not translatable — a checklist line's text,
   * a session's length in minutes. The surface writes the sentence around it.
   */
  detail?: string;
}

export interface TaskActivitySources {
  checkItems: CheckItem[];
  focusSessions: FocusSession[];
}

/** Minutes actually spent, which is not the same as the length it was set to. */
function minutesOf(session: FocusSession): number {
  return Math.max(1, Math.round(session.accumulatedSeconds / 60));
}

/**
 * This Task's history, newest first.
 *
 * Newest first because the question a reader opens this with is "what just
 * happened", not "how did this start" — and the entry that answers it should
 * not be at the bottom of a list whose length depends on how long the Task
 * has been around.
 */
export function taskActivity(task: Task, sources: TaskActivitySources): TaskActivityEntry[] {
  const entries: TaskActivityEntry[] = [];
  const add = (kind: TaskActivityKind, at: string | undefined, detail?: string, id?: string) => {
    if (at) entries.push({ id: id ?? `${task.id}:${kind}`, kind, at, ...(detail ? { detail } : {}) });
  };

  add("created", task.createdAt);
  add("completed", task.completedAt);
  add("wontDo", task.wontDoAt);
  add("trashed", task.deletedAt);
  add("pinned", task.pinnedAt);

  for (const item of sources.checkItems) {
    if (item.taskId !== task.id) continue;
    add("checkItem", item.completedAt, item.text, `${item.id}:done`);
  }

  for (const session of sources.focusSessions) {
    if (session.taskId !== task.id) continue;
    // `startedAt` and not `startAt`: the second one is moved by every resume,
    // so a session paused twice would claim to have begun at the last resume.
    add("focus", session.startedAt, String(minutesOf(session)), `${session.id}:focus`);
  }

  /**
   * "Last edited" is added only when it says something the entries above do
   * not. Every write touches `updatedAt`, so completing a Task stamps it too
   * — and a list whose top two rows are "Completed" and "Edited", one second
   * apart, is a list that has learned to repeat itself.
   */
  const latest = entries.reduce((newest, entry) => (entry.at > newest ? entry.at : newest), "");
  add("updated", task.updatedAt > latest ? task.updatedAt : undefined);

  return entries.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
