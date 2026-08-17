// What a scope offers in its View Bar (SPACES_REDESIGN_II §12-§14).
//
// Two kinds of thing sit in one bar, and conflating them is what this module
// exists to stop:
//
//   Section    a screen about the scope itself — Overview, Goals, Horizons
//   Task View  the same Canonical Task Set, read a different way
//
// `Goals` was carried as a Task View with `layout: "board"`, which made the
// engine answer a question it does not hold: a Goal is not a Task read
// differently, it is a different record with its own Source of Truth (§26,
// §27.2). The distinction lives in the types now.
//
// The user is NOT shown that split (§14). One flat bar, one active item, no
// second navigation row — the internal classification is for the code, not a
// decision to hand the reader.
import { spaceViewDef, type SpaceViewDef, type SpaceViewId } from "./spaceViews";

export type SpaceSectionId = "overview" | "goals" | "horizons";
/** Derived from the view table, so the two cannot drift apart. */
export type BuiltInTaskViewId = SpaceViewId;
export type SpaceNavId = SpaceSectionId | BuiltInTaskViewId;

export type SpaceNavItem =
  | { kind: "section"; id: SpaceSectionId }
  | { kind: "task-view"; id: BuiltInTaskViewId };

/**
 * §14's canonical order, and the only place it is written down. A screen
 * names the active id; it never re-states the sequence.
 */
export const SPACE_NAV: readonly SpaceNavItem[] = [
  { kind: "section", id: "overview" },
  { kind: "task-view", id: "list" },
  { kind: "task-view", id: "board" },
  { kind: "task-view", id: "gantt" },
  { kind: "task-view", id: "calendar" },
  { kind: "section", id: "goals" },
  { kind: "section", id: "horizons" },
];

/**
 * Task Views whose renderer is not connected yet.
 *
 * Empty since STEP 9 connected the last one. Kept rather than deleted because
 * it is where a fifth view waits between being declared in the table and
 * having something to draw — and because an empty set says that plainly,
 * where its absence would say nothing at all.
 */
export const PENDING_TASK_VIEWS: ReadonlySet<BuiltInTaskViewId> = new Set();

/** The level a View Bar is being drawn at. */
export type NavScopeKind = "space" | "project" | "folder" | "list";

/**
 * What this scope offers.
 *
 * A Space drops Board: statuses belong to a Project (§0.3.3), so a Space
 * holding two of them has no defined column set. The order never changes —
 * an item is absent, not moved.
 */
export function navItemsForScope(scope: NavScopeKind): SpaceNavItem[] {
  return SPACE_NAV.filter((item) => {
    if (item.kind === "task-view") {
      if (PENDING_TASK_VIEWS.has(item.id)) return false;
      if (scope === "space" && item.id === "board") return false;
    }
    return true;
  });
}

export function isSpaceNavId(value: unknown): value is SpaceNavId {
  return SPACE_NAV.some((item) => item.id === value);
}

export function navItem(id: SpaceNavId): SpaceNavItem {
  return SPACE_NAV.find((item) => item.id === id) ?? SPACE_NAV[0];
}

export function isTaskView(id: SpaceNavId): id is BuiltInTaskViewId {
  return navItem(id).kind === "task-view";
}

export function isSection(id: SpaceNavId): id is SpaceSectionId {
  return navItem(id).kind === "section";
}

/**
 * The view definition behind a nav id, for the ones that have one.
 *
 * A Section returns undefined rather than a definition it would then have to
 * be excused from — the absence IS the classification, and the narrowing on
 * `isTaskView` makes the compiler check it at every call site instead of
 * asking each one to remember.
 */
export function viewDefForNav(id: SpaceNavId): SpaceViewDef | undefined {
  return isTaskView(id) ? spaceViewDef(id) : undefined;
}
