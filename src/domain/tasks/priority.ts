// Priority as a property with rules, rather than a field anyone may write
// (spec §8.4, §8.8, §8.9, §8.31).
//
// The Drawer has been assigning `priority` straight through `onUpdate` from a
// `<select>` since it was built. That is what §8.39 forbids twice over — no
// undo, and the change bypasses the common command every other surface uses —
// and it is why picking the same level again still wrote a record.
import type { Task, TaskPriority } from "../../types";
import { setTaskPriority, type TaskMutation } from "./mutations";

/**
 * The levels, in the order §8.5's popover draws them.
 *
 * Ascending, with None first, because None is the value a Task starts at
 * (§8.3) and the list then reads as a scale rather than as an arbitrary set.
 * One array, so the popover, the keyboard ring and any future shortcut map
 * cannot disagree about what the order is.
 */
export const PRIORITY_LEVELS: readonly TaskPriority[] = ["none", "low", "medium", "high"];

/**
 * §8.9: one canonical empty value.
 *
 * Named rather than written as a literal at each site, because §8.39's second
 * prohibited pattern is having two of them — a `null` creeping in beside
 * `"none"` is exactly the drift a shared constant prevents.
 */
export const NO_PRIORITY: TaskPriority = "none";

/**
 * Whether a value from outside the app is one this app knows (§8.39's last
 * line: do not render an invalid priority as if it were a level).
 */
export function isPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && PRIORITY_LEVELS.includes(value as TaskPriority);
}

/**
 * The mutation for choosing a level, or null when there is nothing to change.
 *
 * §8.8: re-selecting the current level is a no-op. The null is the whole
 * point of this function existing beside `setTaskPriority` — a command that
 * always returns a mutation leaves the caller to compare the values itself,
 * and every caller that forgot would write a no-change record, push an undo
 * entry for it, and add a line to the activity history saying nothing
 * happened.
 *
 * The popover still closes on a re-select (§8.10). Choosing the level you
 * already had is a completed choice, not a rejected one.
 */
export function priorityChange(task: Task, level: TaskPriority): TaskMutation | null {
  if (task.priority === level) return null;
  return setTaskPriority(task, level);
}
