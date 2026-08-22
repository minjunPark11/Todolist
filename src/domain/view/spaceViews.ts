// The Task Views a scope offers, as data (SPACES_CLICKUP_UI_DESIGN U4,
// SPACES_REDESIGN_II §21/§25).
//
// Screens that were hand-written tabs are rows in this table. They differ only
// in `filter.sources`, `groupBy` and `layout` — which is the claim U4 makes,
// written down where it can be checked instead of asserted.
//
// `goals` and `horizons` USED to be rows here, carried as boards. They are
// gone: a Goal is not a Task read a different way, it is a different record
// with its own Source of Truth (§26, §27.2), and giving it a `layout` made the
// engine answer a question it does not hold. Both are Domain Sections now —
// see ./spaceNav, which classifies what the bar shows.
//
// A view is NOT inherited down the tree. It is defined once here and opened at
// whatever scope the tree is standing on (§16), which is why the scope arrives
// as an argument rather than being baked into each definition.
import type { ItemSource } from "./item";
import type { GroupAxis, SortSpec, ViewFilter, ViewSpec } from "./viewSpec";

export type SpaceViewId = "list" | "board" | "gantt" | "calendar";

export interface SpaceViewDef {
  id: SpaceViewId;
  groupBy: GroupAxis;
  layout: ViewSpec["layout"];
  sources: ItemSource[];
  sort: SortSpec;
}

/**
 * The four of §25, each answering a different question about the same Items:
 * what is there, what state it is in, when it happens, over what span.
 *
 * All four are declared even though only `board` has a renderer wired — the
 * table is the contract, and `PENDING_TASK_VIEWS` in ./spaceNav is what keeps
 * the unwired ones out of the bar until STEP 9 connects them.
 *
 * `board` carries tasks only, which is U5 read the other way round: tasks and
 * goals mix in a List, and separating them is a filter rather than a place.
 * Every view is Tasks now: `list` and `gantt` also took goals and milestones
 * until the Goals feature was removed.
 */
export const SPACE_VIEWS: readonly SpaceViewDef[] = [
  { id: "list", groupBy: "none", layout: "list", sources: ["task"], sort: { key: "dueDate" } },
  { id: "board", groupBy: "status", layout: "board", sources: ["task"], sort: { key: "dueDate" } },
  {
    // Grouped by List, not flat. §50C.20 asks that a row identify its List and
    // prefers a flat table with a List column; the timeline row has no column
    // to put one in — it is a label and a bar — so the group heading is where
    // that context can live. Using the engine's axis beats widening the shared
    // row for one caller.
    id: "gantt",
    groupBy: "list",
    layout: "timeline",
    sources: ["task"],
    sort: { key: "dueDate" },
  },
  { id: "calendar", groupBy: "none", layout: "timegrid", sources: ["task"], sort: { key: "dueDate" } },
];

export function isSpaceViewId(value: unknown): value is SpaceViewId {
  return SPACE_VIEWS.some((view) => view.id === value);
}

export function spaceViewDef(id: SpaceViewId): SpaceViewDef {
  return SPACE_VIEWS.find((view) => view.id === id) ?? SPACE_VIEWS[0];
}

/**
 * The spec for one view at one scope.
 *
 * The scope is spread in rather than merged field by field, so a Folder scope
 * cannot silently keep a stale `listId` from the level below it — the caller
 * owns "where", this owns "how".
 */
export function specForSpaceView(
  id: SpaceViewId,
  scope: Pick<ViewFilter, "folderId" | "listId">,
  name: string,
): ViewSpec {
  const def = spaceViewDef(id);
  // Narrowest first: the tightest scope is what names the view.
  const at = scope.listId ?? scope.folderId ?? "all";
  return {
    id: `space-view-${def.id}-${at}`,
    name,
    // Top level only. A child card beside its parent reads as two pieces of
    // work rather than one inside the other, and now that a subtask IS a Task
    // (domain/tasks/children.ts) every board would otherwise double in size.
    // The parent carries its children; the panel is where they are opened.
    filter: { ...scope, sources: def.sources, parentId: "" },
    groupBy: def.groupBy,
    sort: def.sort,
    layout: def.layout,
  };
}
