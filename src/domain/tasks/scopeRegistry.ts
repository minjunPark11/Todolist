// The nine Scopes of the Tasks Module, and what each one allows
// (TickTick plan §12.3, §12.4, §12.20).
//
// The plan's reason for a registry is a prohibition (§12.26, §12.20): no
// component may re-derive product rules from the path.
//
//     if pathname === '/today' ...
//
// Every screen that writes that line owns a copy of the rule, and the copies
// drift — which is the shape of the bugs v0.10.1 and v0.10.2 fixed, where a
// sidebar count and a header count answered the same question differently.
// One table here, read by everything.
//
// This is Implementation Phase 1 (§16.24), which is deliberately not a screen:
// the types, the registry, and the URL contract that Phase 3's shell will read.

export type TaskScopeKind =
  | "today"
  | "upcoming"
  | "inbox"
  | "list"
  | "folder"
  | "tag"
  | "filter"
  | "completed"
  | "wontDo"
  | "trash";

/**
 * The three Views, and every WORKING Scope now offers all three
 * (TASK_VIEWS_EVERYWHERE_DESIGN.md §1, §2).
 *
 * §5.45 used to allow Board and Gantt on the Inbox and a real List only, and
 * its reason was that a Scope gathering several Lists "would draw bars whose
 * rows belong to different places". Two things retired it:
 *
 *   - the timeline already answers that. Its `groupBy` is `"list"`
 *     (`domain/view/spaceViews.ts`), so a bar sits under a heading naming the
 *     List it belongs to — the very context §5.45 said was missing;
 *   - the Board's columns now have an answer for those Scopes too. They are
 *     the Lists (`domain/tasks/boardAxis.ts`), which makes a drop a move
 *     between Lists rather than a statement about a Section that cannot exist.
 *
 * What stays List-only is the finished work: Completed, Won't Do and Trash.
 * A board there would let a card be dragged into a different List — a write to
 * a record that is over — and those three Scopes are the ones with no `⋯` menu
 * at all (`domain/view/scopeViewOptions.ts`). §2.4 has the rest of the reason.
 *
 * This is the Tasks Module's set, not the whole app's. `List.defaultViewKey`
 * stores a free string on purpose (Add List design §13.7) — a key this build
 * cannot open is kept and resolved to something it can, never dropped.
 */
export type TaskViewKind = "list" | "board" | "gantt";

/**
 * Every View this module knows, as a value.
 *
 * Exported so tests can sweep the whole set rather than a list someone typed
 * out: the hardening sweep for "unsupported URL state 0" was checking `list`
 * and `board` by name and so said nothing at all about `gantt` on the day it
 * arrived. A widened union now widens the sweep with it.
 */
export const TASK_VIEW_KINDS: readonly TaskViewKind[] = ["list", "board", "gantt"];

/**
 * Where the user is standing, as a typed value rather than a path string
 * (§5.43, §5.44). Only four Scopes name a record; the rest are one screen each.
 */
export type TaskScopeRef =
  | { kind: "today" }
  | { kind: "upcoming" }
  | { kind: "inbox" }
  | { kind: "completed" }
  | { kind: "wontDo" }
  | { kind: "trash" }
  | { kind: "list"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "filter"; id: string };

/**
 * Who owns a Task created from this Scope (§12.4's `+ 작업 Owner` column).
 *
 * `requiresList` is Folder's answer and is not a missing case: a Folder holds
 * several Lists and the plan refuses to pick one silently, so the UI must ask.
 * The resolver itself is Phase 4 (§16.27); this is the skeleton §16.24 asks
 * for — the policy, not the lookup.
 */
export type CreateOwner = "inbox" | "currentList" | "requiresList" | "filterDefined" | "none";

export interface TaskScopePolicy {
  kind: TaskScopeKind;
  /** First path segment (§12.4's URL column). */
  segment: string;
  /** Whether the URL carries a record id after the segment. */
  hasId: boolean;
  allowedViews: readonly TaskViewKind[];
  defaultView: TaskViewKind;
  canCreate: boolean;
  canManualReorder: boolean;
  /**
   * Which rows the Scope counts (§12.14). `active` means
   * `deletedAt == null AND completedAt == null` — the canonical meaning §12.4
   * fixes, so no screen invents a second one.
   */
  countMode: "active" | "completed" | "wontDo" | "trash";
  createOwner: CreateOwner;
}

const LIST_ONLY = ["list"] as const;
/** Every View, for every Scope whose work is still live. */
const ALL_VIEWS = ["list", "board", "gantt"] as const;

export const scopeRegistry: Readonly<Record<TaskScopeKind, TaskScopePolicy>> = {
  today: {
    kind: "today",
    segment: "today",
    hasId: false,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    // §7.5 keeps free reorder out of the MVP so that dragging a due-only Task
    // cannot silently create a TodayPlan membership for it.
    canManualReorder: false,
    countMode: "active",
    createOwner: "inbox",
  },
  upcoming: {
    kind: "upcoming",
    segment: "upcoming",
    hasId: false,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "inbox",
  },
  inbox: {
    kind: "inbox",
    segment: "inbox",
    hasId: false,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: true,
    countMode: "active",
    createOwner: "inbox",
  },
  list: {
    kind: "list",
    segment: "list",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: true,
    countMode: "active",
    createOwner: "currentList",
  },
  folder: {
    kind: "folder",
    segment: "folder",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "requiresList",
  },
  tag: {
    kind: "tag",
    segment: "tag",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "inbox",
  },
  filter: {
    kind: "filter",
    segment: "filter",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "filterDefined",
  },
  completed: {
    kind: "completed",
    segment: "completed",
    hasId: false,
    allowedViews: LIST_ONLY,
    defaultView: "list",
    canCreate: false,
    canManualReorder: false,
    countMode: "completed",
    createOwner: "none",
  },
  // D-23. A terminal state beside completed and trashed, and the third of the
  // three the sidebar's bottom section offers.
  wontDo: {
    kind: "wontDo",
    segment: "wont-do",
    hasId: false,
    allowedViews: LIST_ONLY,
    defaultView: "list",
    canCreate: false,
    canManualReorder: false,
    countMode: "wontDo",
    createOwner: "none",
  },
  trash: {
    kind: "trash",
    segment: "trash",
    hasId: false,
    allowedViews: LIST_ONLY,
    defaultView: "list",
    canCreate: false,
    canManualReorder: false,
    countMode: "trash",
    createOwner: "none",
  },
};

export const TASK_SCOPE_KINDS = Object.keys(scopeRegistry) as TaskScopeKind[];

export function policyFor(ref: TaskScopeRef): TaskScopePolicy {
  return scopeRegistry[ref.kind];
}

/** §5.45: view validation lives here, not repeated in each screen. */
export function isViewAllowed(kind: TaskScopeKind, view: string): view is TaskViewKind {
  return scopeRegistry[kind].allowedViews.some((allowed) => allowed === view);
}

/**
 * The view a Scope should show for a requested one (§5.45, §5.46, §5.65).
 * Anything the Scope does not allow — including `?view=banana` — resolves to
 * its default rather than to an error, because a bad URL must not be able to
 * break a screen.
 */
export function resolveView(kind: TaskScopeKind, requested?: string): TaskViewKind {
  if (requested && isViewAllowed(kind, requested)) return requested;
  return scopeRegistry[kind].defaultView;
}
