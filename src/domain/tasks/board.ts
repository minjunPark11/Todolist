// The two Boards, and the one thing they do not share (TickTick plan §16.30).
//
// §16.30 allows one column component for both and then draws the line this
// module exists to hold: the DOMAIN semantics are adapters. The same visual
// drag calls a different canonical command depending on which Board it
// happened on, and Gate 7 is four statements of that one rule —
//
//   - an Inbox Board drag must not create a `sectionId`;
//   - a List Board drag must not quietly change a date;
//   - the two must be different commands, not one command with a flag;
//   - a derived sort cannot be reordered by hand.
//
// The reason is in §6.24: an Inbox column is VIRTUAL, computed from the
// Task's own dates, while a List column is a `ListSection` record. Dropping a
// card in one is a statement about when the work happens; in the other it is
// a statement about where it sits on a board. A single "move to column"
// command would have to guess which was meant.
import type { ListSection, Task } from "../../types";
import type { TaskMutation } from "./mutations";
import { sectionsForList } from "./sections";

/** §6.24's three virtual columns, in the order §3.14 shows them. */
export const INBOX_BUCKETS = ["unsorted", "scheduled", "someday"] as const;
export type InboxBucket = (typeof INBOX_BUCKETS)[number];

/**
 * Which Inbox column a Task is in (§6.24).
 *
 * Nothing is stored. `someday` wins over a date because §6.23 forbids holding
 * both at once — and a record that has drifted into that state has to land in
 * exactly one column rather than disappear or appear twice.
 */
export function inboxBucketOf(task: Pick<Task, "isSomeday" | "dueDate">): InboxBucket {
  if (task.isSomeday) return "someday";
  return task.dueDate ? "scheduled" : "unsorted";
}

/**
 * §6.25's drag patches, as the shared domain function it asks for.
 *
 * Null means the drop cannot be committed as it stands: `scheduled` IS a
 * date, so §6.25 asks for one rather than inventing today — the same refusal
 * `resolveCreateContext` makes for the Upcoming Scope, and for the same
 * reason. A caller that has a date passes it.
 *
 * `isSomeday` and `dueDate` are the only fields written. That is Gate 7's
 * second line, and it is enforced by there being no other field here to
 * write: this function cannot reach `sectionId`.
 */
export function moveToInboxBucket(task: Task, bucket: InboxBucket, date = ""): TaskMutation | null {
  const undo = { isSomeday: task.isSomeday, dueDate: task.dueDate };
  switch (bucket) {
    case "unsorted":
      return { patch: { isSomeday: false, dueDate: "" }, undo, labelKey: "tasks.undoMoved" };
    case "scheduled": {
      if (!date) return null;
      // §6.23: a dated Task is not a someday Task, so the flag is cleared in
      // the same patch rather than left for a later read to reconcile.
      return { patch: { isSomeday: false, dueDate: date }, undo, labelKey: "tasks.undoDateChanged" };
    }
    case "someday":
      // §6.23 again, from the other side: keeping the date would leave a Task
      // that is both "no plan to do this" and "due Friday".
      return { patch: { isSomeday: true, dueDate: "" }, undo, labelKey: "tasks.undoSomeday" };
  }
}

/** A Board column, whichever Board it belongs to. */
export interface BoardColumn {
  id: string;
  /** For the Inbox's virtual columns, which have no record to name them. */
  labelKey?: string;
  /** For a List's Sections, which the user named. */
  name?: string;
  /** Dropping here needs a date before it can be committed (§6.25). */
  requiresDate?: boolean;
}

export const INBOX_COLUMNS: BoardColumn[] = [
  { id: "unsorted", labelKey: "tasks.bucketUnsorted" },
  { id: "scheduled", labelKey: "tasks.bucketScheduled", requiresDate: true },
  { id: "someday", labelKey: "tasks.bucketSomeday" },
];

/**
 * A List's columns: its Sections, with the unsectioned default first (§7.34).
 *
 * The default column is not a record and never becomes one. A Task arrives
 * there by having no Section, which is where every Task starts, and dropping
 * a card back into it clears `sectionId` rather than creating a "Misc"
 * Section behind the user's back.
 */
export function listBoardColumns(listId: string, sections: ListSection[]): BoardColumn[] {
  return [
    { id: "", labelKey: "tasks.sectionDefault" },
    ...sectionsForList(listId, sections).map((section) => ({ id: section.id, name: section.name })),
  ];
}
