// Everything that happened, across every task
// (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §4.2, F4-B).
//
// The Activities tab's whole implementation. `taskActivity` already assembles
// one task's history out of timestamps that were being stored anyway —
// `createdAt`, `completedAt`, a focus session's `startedAt`, a check item's
// `completedAt` — so an account-wide feed is that function run over every task
// and merged by time. Nothing new is written down.
//
// That is also what makes this the better half of the panel. A notification
// only exists if the app was open to record it (§1); an activity is a
// timestamp on a record, so the work someone did on their phone last night is
// here whether or not this device was running.
import type { CheckItem, FocusSession, Task } from "../../types";
import { taskActivity, type TaskActivityEntry } from "../tasks/activity";

export interface AccountActivityEntry extends TaskActivityEntry {
  taskId: string;
  taskTitle: string;
}

export interface AccountActivityInput {
  tasks: Task[];
  checkItems: CheckItem[];
  focusSessions: FocusSession[];
  /** How many to keep. The panel shows a feed, not an archive. */
  limit?: number;
}

export const DEFAULT_ACTIVITY_LIMIT = 100;

/**
 * The account's history, newest first.
 *
 * O(tasks + checkItems + focusSessions) — `taskActivity` filters both source
 * collections per task, so they are grouped by task id first. Without that,
 * an account with 500 tasks and 2000 focus sessions walks a million rows every
 * time the panel opens.
 */
export function accountActivity({
  tasks,
  checkItems,
  focusSessions,
  limit = DEFAULT_ACTIVITY_LIMIT,
}: AccountActivityInput): AccountActivityEntry[] {
  const checkItemsByTask = new Map<string, CheckItem[]>();
  for (const item of checkItems) {
    const bucket = checkItemsByTask.get(item.taskId);
    if (bucket) bucket.push(item);
    else checkItemsByTask.set(item.taskId, [item]);
  }

  const sessionsByTask = new Map<string, FocusSession[]>();
  for (const session of focusSessions) {
    const bucket = sessionsByTask.get(session.taskId);
    if (bucket) bucket.push(session);
    else sessionsByTask.set(session.taskId, [session]);
  }

  const entries: AccountActivityEntry[] = [];
  for (const task of tasks) {
    const own = taskActivity(task, {
      checkItems: checkItemsByTask.get(task.id) ?? [],
      focusSessions: sessionsByTask.get(task.id) ?? [],
    });
    for (const entry of own) {
      entries.push({ ...entry, taskId: task.id, taskTitle: task.title });
    }
  }

  return entries
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, Math.max(0, limit));
}
