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
import type { CreateResolution } from "./createResolver";
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

/** What a column may be called, before it is more words than a header holds. */
export const COLUMN_NAME_MAX = 40;

/**
 * A name the user typed, as it is worth storing.
 *
 * Trimmed and capped rather than refused: a column name is not a field anyone
 * can get wrong, and an editor that argues about whitespace is an editor
 * arguing about nothing. Empty comes back as "" and the caller drops the key,
 * which is what makes "cleared" and "never named" the same state — and what
 * lets clearing a name restore the built-in one instead of leaving a blank
 * header.
 *
 * A name does NOT follow the interface language. There is no way to translate
 * "이번 주 안에", and guessing would be worse than leaving the words alone.
 */
export function sanitizeColumnName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, COLUMN_NAME_MAX) : "";
}

export type InboxColumnNames = Partial<Record<InboxBucket, string>>;

export function sanitizeInboxColumnNames(value: unknown): InboxColumnNames {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const out: InboxColumnNames = {};
  for (const bucket of INBOX_BUCKETS) {
    const name = sanitizeColumnName(record[bucket]);
    if (name) out[bucket] = name;
  }
  return out;
}

/**
 * The Inbox's columns under whatever the user calls them.
 *
 * The rule stays ours and the words become theirs — the two are separate on
 * purpose (TICKTICK_INBOX_COLUMNS_DESIGN.md §4.1). Renaming `일정` to "이번 주"
 * does not make the column mean something else, which is exactly why renaming
 * is the one thing on that ⋯ menu that can be answered before the rules reach
 * the screen: it moves no task anywhere.
 */
export function inboxBoardColumns(names: InboxColumnNames = {}): BoardColumn[] {
  return INBOX_COLUMNS.map((column) => {
    const name = names[column.id as InboxBucket];
    return name ? { ...column, name } : column;
  });
}

/**
 * Creating INTO a column, which §12.16 names as one of its entry points.
 *
 * The column does not decide the owner — `resolveCreateContext` already did,
 * and this narrows that answer rather than replacing it. Everything §12.16
 * forbids a `+` from working out for itself (which List, which day the Scope
 * plans) arrives in `base` untouched.
 *
 * Two functions rather than one with a flag, because Gate 7 is the same rule
 * for a creation as for a drag: `createInInboxBucket` cannot reach `sectionId`
 * and `createInListSection` cannot reach a date. A task typed into a column
 * has to be a task that column would have accepted by drag.
 */
export function createInInboxBucket(base: CreateResolution, bucket: InboxBucket, date = ""): CreateResolution {
  switch (bucket) {
    case "unsorted":
      // Stated rather than left to the defaults. A new Task has neither field
      // set, but a column that means "neither field is set" should say so —
      // the day `createTask` starts seeding a date, this column still holds.
      return { ...base, patch: { ...base.patch, isSomeday: false, dueDate: "" } };

    case "scheduled": {
      // §6.25's refusal, at the other entry point. The column IS a date, so a
      // task typed here without one would be committed straight into the
      // column beside it — §27.3's bug, arriving by a different door.
      if (!date) {
        return {
          ...base,
          targetListId: null,
          requiredBeforeCommit: [...base.requiredBeforeCommit, "date"],
        };
      }
      return { ...base, patch: { ...base.patch, isSomeday: false, dueDate: date } };
    }

    case "someday":
      // §6.23: the two are exclusive, so the date is cleared in the same patch
      // rather than left for a later read to reconcile.
      return { ...base, patch: { ...base.patch, isSomeday: true, dueDate: "" } };
  }
}

/**
 * The List Board's half. `""` is the unsectioned default, and it is written as
 * an empty `sectionId` rather than skipped: a Task created there must not
 * inherit a Section from anything else the caller merged into `patch`.
 */
export function createInListSection(base: CreateResolution, sectionId: string): CreateResolution {
  return { ...base, patch: { ...base.patch, sectionId } };
}

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
