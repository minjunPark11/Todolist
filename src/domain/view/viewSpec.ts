// filter + groupBy + sort over one Item collection (CLICKUP_IMPORT_DESIGN §4.2).
//
// The four screens this replaces are four hardcoded instances of the same
// thing: Horizons groups by period, Planning by quadrant, Today by bucket,
// Archive filters by status. Expressed here they become presets, and the
// filter language they share becomes the same language automations will use
// for their conditions (W4) — one vocabulary instead of two.
//
// The grouping rules are delegated, not reimplemented: quadrant comes from
// eisenhower.ts and bucket from todayView.ts, both already tested and both
// still driving the live screens. The equivalence tests assert that a view
// and its screen answer identically, so this cannot quietly drift while the
// two exist side by side.
import type { Folder, List, Project, Task, TaskPriority } from "../../types";
import { getMatrixPosition } from "../../utils/eisenhower";
import { defaultBucketFor } from "../../utils/todayView";
import { HORIZONS } from "../../utils/horizons";
import type { Item, ItemSource } from "./item";

export type GroupAxis =
  | "none"
  | "bucket"
  | "quadrant"
  | "horizon"
  | "space"
  | "folder"
  | "list"
  | "priority"
  | "dueDate"
  | "status";

export type SortKey = "manual" | "dueDate" | "scheduledDate" | "priority" | "title" | "createdAt";

export interface ViewFilter {
  // The three scopes a view can be opened at (SPACES_CLICKUP_UI_DESIGN §16).
  // They are not exclusive and they do not need to be: a Folder is inside a
  // Space, so naming both narrows to the same set rather than contradicting.
  spaceId?: string;
  /** "" matches the Folderless Lists — a real scope, not "any folder". */
  folderId?: string;
  listId?: string;
  /**
   * Whose child an Item is. "" selects the top level, which is what a board
   * of cards wants: a child beside its parent reads as two pieces of work
   * rather than one inside the other.
   */
  parentId?: string;
  /** An item matches when it carries every tag named. */
  tags?: string[];
  statusIds?: string[];
  priorities?: TaskPriority[];
  sources?: ItemSource[];
  /** Inclusive, matched against dueDate or scheduledDate — whichever is set. */
  from?: string;
  to?: string;
  blocked?: boolean;
  done?: boolean;
}

export interface SortSpec {
  key: SortKey;
  direction?: "asc" | "desc";
}

export interface ViewSpec {
  id: string;
  name: string;
  filter: ViewFilter;
  groupBy: GroupAxis;
  sort: SortSpec;
  layout: "list" | "columns" | "rows" | "board" | "table" | "timegrid" | "timeline";
}

export interface ViewGroup {
  /** Stable key for the axis value; "" is the catch-all bucket. */
  id: string;
  items: Item[];
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };
const NO_DATE = "9999-12-31";

// === filter ===

function matchesDateWindow(item: Item, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  // Either date can put an item in the window: a task planned for Tuesday and
  // one due Tuesday are both "this week's work", and a view that showed only
  // one of them would be lying by omission.
  const dates = [item.scheduledDate, item.dueDate].filter(Boolean);
  if (dates.length === 0) return false;
  return dates.some((date) => (!from || date >= from) && (!to || date <= to));
}

export function matchesFilter(item: Item, filter: ViewFilter): boolean {
  if (filter.spaceId !== undefined && item.spaceId !== filter.spaceId) return false;
  if (filter.folderId !== undefined && item.folderId !== filter.folderId) return false;
  if (filter.listId !== undefined && item.listId !== filter.listId) return false;
  if (filter.parentId !== undefined && item.parentId !== filter.parentId) return false;
  if (filter.sources && !filter.sources.includes(item.source)) return false;
  if (filter.statusIds && !filter.statusIds.includes(item.statusId)) return false;
  if (filter.priorities && !filter.priorities.includes(item.priority)) return false;
  if (filter.blocked !== undefined && item.blocked !== filter.blocked) return false;
  if (filter.done !== undefined && item.done !== filter.done) return false;
  if (filter.tags && filter.tags.length > 0) {
    if (!filter.tags.every((tag) => item.tags.includes(tag))) return false;
  }
  return matchesDateWindow(item, filter.from, filter.to);
}

// === group ===

/**
 * `tasks` is needed because two axes are owned elsewhere: the quadrant and the
 * Today bucket are computed from the Task record by their own modules, and
 * this delegates rather than restating their rules. Items with no matching
 * task (goals, milestones) fall into the catch-all group.
 */
export interface GroupContext {
  today: string;
  taskById: Map<string, Task>;
  /**
   * Group id -> rank, for axes whose order the user owns rather than the
   * product (D10). Built by `groupRank` so the board and the timeline cannot
   * disagree: the same records in a different order on two screens is two
   * truths, not two views. Absent means fall back to name order.
   */
  groupRank?: ReadonlyMap<string, number>;
}

/**
 * Ranks the Spaces or Lists an axis groups by, honouring the order the user
 * arranged them in and falling back to name only where they never said.
 *
 * `order` is optional on a Project and absent on anything the user has not
 * reordered, so records without one sort after those with one — otherwise a
 * single reordered Space would jump ahead of every untouched one for no
 * reason the user could see.
 */
export function groupRank(
  axis: GroupAxis,
  records: { projects?: Project[]; lists?: List[]; folders?: Folder[] },
): ReadonlyMap<string, number> | undefined {
  const source =
    axis === "space"
      ? records.projects?.map((p) => ({ id: p.id, order: p.order, name: p.name }))
      : axis === "folder"
        ? records.folders?.map((f) => ({ id: f.id, order: f.order, name: f.name }))
        : axis === "list"
          ? records.lists?.map((l) => ({ id: l.id, order: l.order, name: l.name }))
          : undefined;
  if (!source || source.length === 0) return undefined;

  const ordered = [...source].sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
    const bo = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
  return new Map(ordered.map((record, index) => [record.id, index]));
}

export function groupKeyFor(item: Item, axis: GroupAxis, context: GroupContext): string {
  switch (axis) {
    case "none":
      return "";
    case "space":
      return item.spaceId;
    case "folder":
      return item.folderId;
    case "list":
      return item.listId;
    case "priority":
      return item.priority;
    case "status":
      return item.statusId;
    case "horizon":
      return item.horizon ?? "";
    case "dueDate":
      return item.dueDate || "";
    case "quadrant": {
      const task = context.taskById.get(item.sourceId);
      return task ? getMatrixPosition(task, context.today).quadrant : "";
    }
    case "bucket": {
      const task = context.taskById.get(item.sourceId);
      return task ? defaultBucketFor(task, context.today, item.blocked) : "";
    }
    default:
      return "";
  }
}

/** Fixed orders so a column cannot move because its first item changed. */
const AXIS_ORDER: Partial<Record<GroupAxis, readonly string[]>> = {
  bucket: ["now", "next", "later"],
  quadrant: ["I", "II", "III", "IV"],
  horizon: HORIZONS,
  priority: ["high", "medium", "low", "none"],
};

function compareGroupIds(
  a: string,
  b: string,
  axis: GroupAxis,
  rank?: ReadonlyMap<string, number>,
): number {
  const order = AXIS_ORDER[axis];
  if (order) {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    // Anything off the scale sorts last rather than first, so the catch-all
    // group never displaces a real column.
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  }
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  // The user's arrangement outranks the alphabet (D10). A group with no rank —
  // a record deleted while its items survive — sorts after every ranked one
  // rather than at the top.
  if (rank) {
    const ar = rank.get(a);
    const br = rank.get(b);
    if (ar !== undefined || br !== undefined) {
      return (ar ?? Number.MAX_SAFE_INTEGER) - (br ?? Number.MAX_SAFE_INTEGER);
    }
  }
  return a < b ? -1 : 1;
}

// === sort ===

export function compareItems(a: Item, b: Item, sort: SortSpec): number {
  const direction = sort.direction === "desc" ? -1 : 1;
  let result = 0;
  switch (sort.key) {
    case "dueDate":
      result = (a.dueDate || NO_DATE).localeCompare(b.dueDate || NO_DATE);
      break;
    case "scheduledDate":
      result = (a.scheduledDate || NO_DATE).localeCompare(b.scheduledDate || NO_DATE);
      break;
    case "priority":
      result = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      break;
    case "title":
      result = a.title.localeCompare(b.title);
      break;
    case "manual":
    case "createdAt":
    default:
      result = 0;
      break;
  }
  // Ties fall back to the key, so two runs over the same data cannot disagree
  // about order — a list that reshuffles on every render reads as broken.
  return (result !== 0 ? result * direction : a.key.localeCompare(b.key));
}

// === apply ===

export function applyView(items: Item[], spec: ViewSpec, context: GroupContext): ViewGroup[] {
  const matched = items.filter((item) => matchesFilter(item, spec.filter));
  const byGroup = new Map<string, Item[]>();
  for (const item of matched) {
    const key = groupKeyFor(item, spec.groupBy, context);
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(item);
    else byGroup.set(key, [item]);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => compareGroupIds(a, b, spec.groupBy, context.groupRank))
    .map(([id, groupItems]) => ({ id, items: [...groupItems].sort((a, b) => compareItems(a, b, spec.sort)) }));
}

/**
 * The groups a view should render even when empty. Horizons draws all five
 * columns because the perspective IS the product (HORIZONS_DESIGN D8), and a
 * board with a missing column reads as a lost column rather than an empty one.
 */
export function axisGroupIds(axis: GroupAxis): readonly string[] | undefined {
  return AXIS_ORDER[axis];
}

// === presets ===
//
// The four screens, written down. They are not wired to the UI yet (P6); they
// exist so the engine is exercised against the real shapes rather than
// invented ones, and so the equivalence tests have something to compare.

export const PRESET_HORIZONS: ViewSpec = {
  id: "preset-horizons",
  name: "Horizons",
  filter: {},
  groupBy: "horizon",
  sort: { key: "dueDate" },
  layout: "columns",
};

export const PRESET_PLANNING: ViewSpec = {
  id: "preset-planning",
  name: "Planning",
  filter: { sources: ["task"] },
  groupBy: "quadrant",
  sort: { key: "dueDate" },
  layout: "columns",
};

export const PRESET_ARCHIVE: ViewSpec = {
  id: "preset-archive",
  name: "Archive",
  filter: { statusIds: ["archived"] },
  groupBy: "none",
  sort: { key: "title" },
  layout: "list",
};

export function presetTodayQueue(today: string): ViewSpec {
  return {
    id: "preset-today",
    name: "Today",
    filter: { sources: ["task"], from: today, to: today },
    groupBy: "bucket",
    sort: { key: "scheduledDate" },
    layout: "list",
  };
}

/** The Space detail's time axis — the 179 lines SpaceHorizons.tsx spends. */
export function presetSpaceHorizons(spaceId: string): ViewSpec {
  return { ...PRESET_HORIZONS, id: `preset-space-horizons`, filter: { spaceId }, layout: "rows" };
}
