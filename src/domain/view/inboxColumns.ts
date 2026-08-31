// The Inbox board's columns as an ORDERED LIST the user owns
// (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 5).
//
// Phases 3 and 4 made a column's rule into data, but the columns themselves
// were still the three the app was born with: `unsorted | scheduled | someday`
// were the keys of every record, so there was no way to express a fourth, no
// way to say which came first, and nothing to delete.
//
// This is the shape that answers the rest of the reference app's ⋯ menu. The
// order is the array's — not a `sortKey` — because the whole list is one
// stored value here, and a key that only ever gets read back in array order is
// a second thing to keep in step with the first.
//
// Migration happens on READ, like everything else in this store (there is no
// schema and no migration table, so the load path IS the migration): an
// account that has only the phase-3 keys is assembled into this shape, and one
// that has neither gets the three defaults.
import type { Task } from "../../types";
import { INBOX_BUCKETS, sanitizeColumnName, type InboxBucket, type InboxColumnNames } from "../tasks/board";
import {
  DEFAULT_INBOX_COLUMN_RULES,
  dropOutcomeForColumn,
  matchesInboxRule,
  sanitizeInboxColumnRule,
  type InboxColumnRule,
  type InboxColumnRules,
  type InboxDropOutcome,
} from "./inboxColumnRules";
import type { RuleContext } from "./viewRules";

export interface InboxColumn {
  id: string;
  /**
   * The built-in name, for the three this app has always drawn.
   *
   * A column the user made has none: there is nothing to translate, because
   * nobody but them chose the words (the rule `matrixQuadrantLabels` follows
   * for the Matrix's boxes).
   */
  labelKey?: string;
  /** What the user calls it, if they have said. */
  name?: string;
  rule: InboxColumnRule;
}

/** Long enough to be a real id, short enough to read in stored JSON. */
function newColumnId(): string {
  return `col-${Math.random().toString(36).slice(2, 10)}`;
}

const BUILT_IN_LABELS: Record<InboxBucket, string> = {
  unsorted: "tasks.bucketUnsorted",
  scheduled: "tasks.bucketScheduled",
  someday: "tasks.bucketSomeday",
};

/** The three, exactly as phases 1-4 drew them. */
export function defaultInboxColumns(): InboxColumn[] {
  return INBOX_BUCKETS.map((bucket) => ({
    id: bucket,
    labelKey: BUILT_IN_LABELS[bucket],
    rule: DEFAULT_INBOX_COLUMN_RULES[bucket],
  }));
}

function sanitizeColumn(value: unknown): InboxColumn | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  // A column with no id is one nothing can point at — not a card, not a drop,
  // not the menu that would delete it.
  if (!id) return null;
  const name = sanitizeColumnName(record.name);
  const labelKey = typeof record.labelKey === "string" ? record.labelKey : "";
  return {
    id,
    ...(labelKey ? { labelKey } : {}),
    ...(name ? { name } : {}),
    rule: sanitizeInboxColumnRule(record.rule),
  };
}

/**
 * The columns in force, from whatever the account happens to hold.
 *
 * Three shapes arrive here and all three have to answer:
 *
 *   the new list          use it
 *   phase 3/4's two keys  assemble the three built-ins from them
 *   nothing at all        the defaults
 *
 * The middle case is the migration, and it is a read rather than a write: an
 * account that never opens the new controls is never rewritten, and a build
 * that predates them still understands what it finds.
 */
export function resolveInboxColumns(
  stored: unknown,
  legacy?: { rules?: Partial<InboxColumnRules>; names?: InboxColumnNames },
): InboxColumn[] {
  if (Array.isArray(stored)) {
    const columns = stored.map(sanitizeColumn).filter((column): column is InboxColumn => column !== null);
    // An empty list is not a board — it is a board nobody could put anything
    // in, and no sequence of the controls below can produce one (the last
    // column refuses to be deleted). So a stored empty means a broken write.
    if (columns.length > 0) return dedupe(columns);
  }
  return defaultInboxColumns().map((column) => {
    const rule = legacy?.rules?.[column.id as InboxBucket];
    const name = legacy?.names?.[column.id as InboxBucket];
    return { ...column, ...(rule ? { rule } : {}), ...(name ? { name } : {}) };
  });
}

/** Two columns with one id would make every operation ambiguous. */
function dedupe(columns: InboxColumn[]): InboxColumn[] {
  const seen = new Set<string>();
  return columns.filter((column) => (seen.has(column.id) ? false : (seen.add(column.id), true)));
}

/**
 * Which column a task is in, or `null` for none of them.
 *
 * Reading order, first match wins — §23.4's answer, and the reason it is right
 * here too: two columns matching is a state the user built, and the one on the
 * left is the one they read first.
 */
export function columnOfTask(task: Task, columns: InboxColumn[], context: RuleContext): string | null {
  for (const column of columns) {
    if (matchesInboxRule(task, column.rule, context)) return column.id;
  }
  return null;
}

/** What a drop into this column would do, or why it will not happen. */
export function dropOutcomeForColumnId(
  task: Task,
  columns: InboxColumn[],
  columnId: string,
  context: RuleContext,
): InboxDropOutcome {
  const column = columns.find((candidate) => candidate.id === columnId);
  // A column that is not there cannot take anything. Naming it "list" would be
  // a lie, so this is the one refusal with no reason a reader would recognise
  // — and it can only happen to a drop racing a deletion.
  if (!column) return { accepted: false, reason: "list" };
  return dropOutcomeForColumn(task, column.rule, context);
}

/**
 * Whether this column has to ask which day.
 *
 * Derived rather than stored, and the condition is "the rule cannot answer for
 * itself": with two or more dated buckets there is a range of days that would
 * satisfy it and picking one would be the app choosing for the user (§6.25).
 * With exactly one, the rule already names the day.
 */
export function columnAsksForDate(column: InboxColumn): boolean {
  const dated = column.rule.dateBuckets.filter((bucket) => bucket !== "none" && bucket !== "someday");
  return dated.length > 1;
}

// --- the ⋯ menu, as pure functions -----------------------------------------
//
// Each returns a NEW list. None of them can produce a board with no columns,
// and none can lose a column's rule — the two ways this set of operations
// could take work off the screen.

export function renameInboxColumn(columns: InboxColumn[], id: string, name: string): InboxColumn[] {
  const clean = sanitizeColumnName(name);
  return columns.map((column) => {
    if (column.id !== id) return column;
    // Cleared goes back to the built-in label where there is one, and to ""
    // where there is not — a column the user made has no other name to fall
    // back to, so it keeps the empty string and the UI shows its position.
    const { name: _dropped, ...rest } = column;
    return clean ? { ...rest, name: clean } : rest;
  });
}

export function moveInboxColumn(columns: InboxColumn[], id: string, delta: number): InboxColumn[] {
  const from = columns.findIndex((column) => column.id === id);
  if (from < 0) return columns;
  const to = Math.min(columns.length - 1, Math.max(0, from + delta));
  if (to === from) return columns;
  const next = [...columns];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function addInboxColumn(
  columns: InboxColumn[],
  beside: { id: string; side: "left" | "right" } | null,
  draft: { name: string; rule: InboxColumnRule },
): InboxColumn[] {
  const column: InboxColumn = {
    id: newColumnId(),
    ...(sanitizeColumnName(draft.name) ? { name: sanitizeColumnName(draft.name) } : {}),
    rule: sanitizeInboxColumnRule(draft.rule),
  };
  if (!beside) return [...columns, column];
  const at = columns.findIndex((candidate) => candidate.id === beside.id);
  if (at < 0) return [...columns, column];
  const next = [...columns];
  next.splice(beside.side === "left" ? at : at + 1, 0, column);
  return next;
}

export function setInboxColumnRule(columns: InboxColumn[], id: string, rule: InboxColumnRule): InboxColumn[] {
  return columns.map((column) => (column.id === id ? { ...column, rule: sanitizeInboxColumnRule(rule) } : column));
}

/**
 * Deleting one — and the one thing this app will not do.
 *
 * The last column stays. A board with none is not a simpler board, it is a
 * screen where every task in the Inbox is in the remainder row and nothing can
 * ever leave it. There is no undo good enough to make that a state worth being
 * able to reach in one click.
 *
 * What deleting DOES cost is stated where it is paid: the tasks the column was
 * holding now match no column, and phase 4's remainder row draws them. That is
 * why that row was built first.
 */
export function removeInboxColumn(columns: InboxColumn[], id: string): InboxColumn[] {
  if (columns.length <= 1) return columns;
  const next = columns.filter((column) => column.id !== id);
  return next.length === columns.length ? columns : next;
}
