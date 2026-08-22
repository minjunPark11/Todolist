// The address for every page outside the Tasks Module (Nav Shell audit D-04).
//
// Before this file, half the app had no route at all. `activePage` was a
// `useState` and `navigateSection()` changed it without touching the address
// bar, so Calendar, Focus, Board, Archive and Settings could not be linked to,
// could not be restored by a reload, and could not be told apart by anything
// reading the URL. The new shell needs exactly that last thing: §2.19 asks the
// Rail to derive its active item from the route, which is impossible while the
// route does not know which page is open.
//
// So the direction of the arrow flips. The URL is the page now, and
// `activePage` is read from it rather than set beside it.
//
// The Tasks Module's own nine Scopes are NOT here — they are
// `domain/tasks/scopeRegistry.ts` + `app/taskScopeUrl.ts`, and `App.tsx` gives
// them the first look at the path (§12.3). Nothing in this table may collide
// with a Scope segment, or the Module would swallow the page.
import type { AppSettings, PageId } from "../types";
import { parseSearchUrl, parseTaskScope } from "./taskScopeUrl";

/**
 * D-04's table. One path per page, exact match, no parameters.
 *
 * `today` keeps `/app` rather than `/today`: the Tasks Module already owns
 * `/today` and shows its own Today there. Which of the two Todays survives is
 * a P0-2 question — this file only has to stop them fighting over an address.
 *
 */
export const PAGE_ROUTES: Record<PageId, string> = {
  today: "/app",
  calendar: "/calendar",
  board: "/board",
  focus: "/focus",
  settings: "/settings",
};

/**
 * Addresses that no longer name a page, and where they go instead.
 *
 * All four are the Projects and Goals feature, which is gone: Projects were a
 * second way to group work beside Lists, and Goals a planner of their own, and
 * neither survived the move to a List-shaped app. Links to them exist — in
 * bookmarks, in anyone's history, in a stored start-page setting — so they
 * land on Today rather than on a dead address. `/archive` came here first,
 * when D-20 retired the standalone Archive into the Space that owned it.
 */
export const RETIRED_ROUTES: Record<string, string> = {
  "/archive": PAGE_ROUTES.today,
  "/spaces": PAGE_ROUTES.today,
  "/projects": PAGE_ROUTES.today,
  "/goals": PAGE_ROUTES.today,
};

const ROUTE_TO_PAGE = new Map<string, PageId>(
  (Object.entries(PAGE_ROUTES) as Array<[PageId, string]>).map(([page, path]) => [path, page]),
);

/** Trailing slashes and an empty path both mean the same place. */
function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function pathForPage(page: PageId): string {
  return PAGE_ROUTES[page];
}

/**
 * Which page an address names.
 *
 * Falls back to `today` for anything unrecognised — `/`, `/index.html` in the
 * packaged build, a stale bookmark. A 404 screen would be worse than the
 * landing page for an app whose whole surface is behind one origin.
 */
export function pageForPath(path: string): PageId {
  const normalized = normalize(path);
  const retired = RETIRED_ROUTES[normalized];
  if (retired) return pageForPath(retired);
  return ROUTE_TO_PAGE.get(normalized) ?? "today";
}

/**
 * Whether an address names a destination on its own.
 *
 * The boot redirect below needs to tell "the user asked for Today" from "the
 * user asked for nothing and we defaulted to Today" — `pageForPath` alone
 * cannot, because both answer `today`.
 *
 * The Tasks Module's Scopes count. They are not in `PAGE_ROUTES` — the Module
 * routes itself — but they are still somewhere a link can point, and a boot
 * redirect that did not know about them would answer a deep link to
 * `/list/:id` by throwing the user at their start page.
 */
export function namesAPage(path: string): boolean {
  const normalized = normalize(path);
  if (RETIRED_ROUTES[normalized]) return true;
  if (parseTaskScope(normalized) || parseSearchUrl(normalized) !== null) return true;
  return ROUTE_TO_PAGE.has(normalized);
}

/**
 * The "default start page" setting, as an address.
 *
 * The setting predates this table and stores paths that no longer all exist.
 * `/inbox` opens Today with the triage drawer (`todayIntent` handles the
 * drawer, this only has to land on the right page), `/planning` is the old
 * name for the quadrant Board, and `/projects` used to open a card grid that
 * was removed — anyone still holding it starts on Today, which is what the
 * previous seeding logic did too.
 */
export function pathForDefaultView(defaultView: AppSettings["defaultView"]): string {
  switch (defaultView) {
    case "/calendar":
      return PAGE_ROUTES.calendar;
    case "/board":
    case "/planning":
      return PAGE_ROUTES.board;
    case "/focus":
      return PAGE_ROUTES.focus;
    default:
      return PAGE_ROUTES.today;
  }
}

/**
 * Where the app should open, given the address it was launched with.
 *
 * Returns `""` when the address already names a page — a deep link outranks
 * the setting, the same way it did when this logic lived in the `activePage`
 * initializer. `/login` is excluded because the auth screens render over the
 * shell and redirecting away from them would break signing in.
 *
 * One behaviour moved: `/app` used to be the neutral landing path, so booting
 * there applied the setting. It is Today's own address now, so arriving at it
 * is a request for Today. The place that relied on the old reading — the
 * redirect after signing in — asks `pathForDefaultView` directly instead.
 */
export function bootRedirectFor(path: string, defaultView: AppSettings["defaultView"]): string {
  const normalized = normalize(path);
  if (normalized === "/login" || namesAPage(normalized)) return "";
  const target = pathForDefaultView(defaultView);
  return target === normalized ? "" : target;
}
