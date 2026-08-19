// What the Global Rail highlights, and where each of its items goes
// (Nav Shell spec §2.11–§2.19, audit D-01).
//
// §2.19 wants the active Rail item DERIVED from the route rather than stored
// beside it, so that Back, a reload and a deep link all light the same icon.
// P0-1 made that possible by giving every page an address; this file is the
// reading.
//
// The mapping is deliberately lossy: the Global Modules get an item each and
// **everything else is Tasks**. Archive, the Spaces tree and all nine Tasks
// Scopes are places inside Tasks, not siblings of it — §1.5 is explicit that
// none of them may become a Rail item of its own.
//
// Matrix is the one documented exception (D-19). §1.5's list bans `Board`, and
// that ban holds for a Scope's Board VIEW — promoting one Scope's view to the
// Rail is exactly how a Rail turns into a list of screens. The global Matrix
// is not any Scope's view: it crosses every Space, groups by Space-owned
// statuses, and carries the Quadrant axis that lives nowhere else. It is a
// Global Feature, and it sits with the modules.
import { PAGE_ROUTES, pageForPath } from "./pageRoute";

export const RAIL_ITEMS = ["tasks", "matrix", "calendar", "focus", "search", "settings"] as const;
export type RailItem = (typeof RAIL_ITEMS)[number];

/** The items that light up from the address. Search never does (§2.14). */
export type RailNavItem = Exclude<RailItem, "search">;

/**
 * Where Tasks goes when there is no last location to return to.
 *
 * The Tasks Module's own Today, not the legacy `/app` one: the Rail is the
 * new shell's front door and D-02 puts the v16 Tasks Sidebar behind it. The
 * legacy Today page keeps its address and its entry in the old sidebar until
 * P0-4 moves that content.
 */
export const TASKS_HOME = "/today";

export function railItemFor(path: string): RailNavItem {
  switch (pageForPath(path)) {
    // D-19. The address stays `/board` — the rename is of the feature, not of
    // the route, and moving both at once would break every stored link for a
    // cosmetic gain.
    case "board":
      return "matrix";
    case "calendar":
      return "calendar";
    case "focus":
      return "focus";
    case "settings":
      return "settings";
    // `today`, `projects`, `archive` — and every Tasks Scope, which
    // `pageForPath` reports as its `today` fallback because the Tasks Module
    // routes itself.
    default:
      return "tasks";
  }
}

/**
 * Whether an address is somewhere the Tasks item would return to.
 *
 * Used to keep `lastTasksLocation` (§2.20) — the Rail remembers where you
 * were in Tasks so that Calendar → Tasks does not dump you on Today when you
 * were three lists deep.
 */
export function isTasksLocation(url: string): boolean {
  return railItemFor(url.split("?")[0]) === "tasks";
}

/**
 * A fixed destination per nav item.
 *
 * Tasks is absent on purpose: it is the one item whose destination depends on
 * history rather than on a constant, so `App.tsx` resolves it against
 * `lastTasksLocation` and falls back to `TASKS_HOME`.
 */
export const RAIL_DESTINATIONS: Record<Exclude<RailNavItem, "tasks">, string> = {
  matrix: PAGE_ROUTES.board,
  calendar: PAGE_ROUTES.calendar,
  focus: PAGE_ROUTES.focus,
  settings: PAGE_ROUTES.settings,
};
