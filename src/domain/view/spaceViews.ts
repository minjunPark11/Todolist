// The views a Space offers, as data (SPACES_CLICKUP_UI_DESIGN U4).
//
// Three screens that were three tabs are three rows in this table. They differ
// only in `filter.sources`, `groupBy` and `layout` — which is the claim U4
// makes, written down where it can be checked instead of asserted: the Goals
// tab was 81 lines and SpaceHorizons 179, and neither held a rule the engine
// did not already have.
//
// A view is NOT inherited down the tree. It is defined once here and opened at
// whatever scope the tree is standing on (§16), which is why the scope arrives
// as an argument rather than being baked into each definition.
import type { ItemSource } from "./item";
import type { GroupAxis, SortSpec, ViewFilter, ViewSpec } from "./viewSpec";

export type SpaceViewId = "board" | "goals" | "horizons";

export interface SpaceViewDef {
  id: SpaceViewId;
  groupBy: GroupAxis;
  layout: ViewSpec["layout"];
  sources: ItemSource[];
  sort: SortSpec;
}

/**
 * `board` carries tasks only and `goals` carries goals only, which is U5 read
 * the other way round: the two mix in a List, and separating them is a filter
 * rather than a place. Horizons takes both, because "when is this happening"
 * is a question about all the work, not one kind of it.
 */
export const SPACE_VIEWS: readonly SpaceViewDef[] = [
  { id: "board", groupBy: "status", layout: "board", sources: ["task"], sort: { key: "dueDate" } },
  { id: "goals", groupBy: "status", layout: "board", sources: ["goal"], sort: { key: "dueDate" } },
  {
    id: "horizons",
    groupBy: "horizon",
    layout: "board",
    sources: ["task", "goal", "milestone"],
    sort: { key: "dueDate" },
  },
];

export function isSpaceViewId(value: unknown): value is SpaceViewId {
  return SPACE_VIEWS.some((view) => view.id === value);
}

export function spaceViewDef(id: SpaceViewId): SpaceViewDef {
  return SPACE_VIEWS.find((view) => view.id === id) ?? SPACE_VIEWS[0];
}

/** Which views can show a goal, and so need somewhere to add one. */
export function showsGoals(id: SpaceViewId): boolean {
  return spaceViewDef(id).sources.includes("goal");
}

/**
 * The spec for one view at one scope.
 *
 * The scope is spread in rather than merged field by field, so a Folder scope
 * cannot silently keep a stale `listId` from the level before it — the caller
 * owns "where", this owns "how".
 */
export function specForSpaceView(
  id: SpaceViewId,
  scope: Pick<ViewFilter, "spaceId" | "projectId" | "folderId" | "listId">,
  name: string,
): ViewSpec {
  const def = spaceViewDef(id);
  // Narrowest first: the tightest scope is what names the view.
  const at = scope.listId ?? scope.folderId ?? scope.projectId ?? scope.spaceId ?? "all";
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
