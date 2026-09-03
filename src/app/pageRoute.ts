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

/** Where the Tasks Module opens when nothing more specific is asked for. */
export const TASKS_HOME = "/today";

/**
 * D-04's table. One path per page, exact match, no parameters.
 *
 * `today` and its `/app` used to head this list. **P0-2 is answered**: the
 * app had two Today screens — this page and the Tasks Module's Scope at
 * `/today` — and the Module's is the one that survives. The page is gone, and
 * with it the last address that was not either one of these four or a Scope.
 */
export const PAGE_ROUTES: Record<PageId, string> = {
  calendar: "/calendar",
  board: "/board",
  focus: "/focus",
  settings: "/settings",
};

/**
 * Addresses that no longer name a page, and where they go instead.
 *
 * Three are the Projects and Goals feature, which is gone: Projects were a
 * second way to group work beside Lists, and Goals a planner of their own, and
 * neither survived the move to a List-shaped app. `/archive` came here when
 * D-20 retired the standalone Archive into the Space that owned it. `/app` is
 * the fifth and the newest — the Today PAGE, which had the same name as the
 * Tasks Module's Today Scope and half of its job.
 *
 * Links to all five exist, in bookmarks, in anyone's history, in a stored
 * start-page setting, and in a desktop client that remembers where it was. So
 * they land on the Tasks Module's Today rather than on a dead address, and
 * `bootRedirectFor` MOVES them there rather than drawing something else at an
 * address that says otherwise.
 */
export const RETIRED_ROUTES: Record<string, string> = {
  // The Today page's own address. It is retired rather than deleted because
  // links to it exist — the consent screen sends people there, and a desktop
  // client remembers where it was.
  "/app": TASKS_HOME,
  "/archive": TASKS_HOME,
  "/spaces": TASKS_HOME,
  "/projects": TASKS_HOME,
  "/goals": TASKS_HOME,
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
 * The pages that draw a Task Detail (TASK_DETAIL_PANEL_MERGE_DESIGN.md §7).
 *
 * Settings is not here because it renders no pane. A `?task=` on its address
 * would be a promise the page cannot keep, so it is not written and not read.
 *
 * The Calendar joined when clicking a block stopped opening the calendar's own
 * little event card and started opening the app's Task Detail
 * (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §5) — the same detail, and
 * therefore the same address, as everywhere else a Task can be opened.
 */
const PAGES_WITH_DETAIL = new Set<PageId>(["board", "focus", "calendar"]);

/**
 * A page's address with the open Task written into it (§6.6).
 *
 * The table above says "one path per page, exact match, no parameters", and
 * this is the one parameter — which is also the only thing about these pages
 * that a link, a reload or Back has any reason to carry. Everything else they
 * hold is genuinely UI state.
 */
export function pageUrlFor(page: PageId, taskId = ""): string {
  const path = PAGE_ROUTES[page];
  if (!taskId || !PAGES_WITH_DETAIL.has(page)) return path;
  return `${path}?task=${encodeURIComponent(taskId)}`;
}

/**
 * Which Task a page address has open, if the page can hold one.
 *
 * Reads `ROUTE_TO_PAGE` rather than `pageForPath`, because that one answers
 * `today` for anything it does not recognise — including every Tasks Module
 * address, which carries its own `?task=` and must not be answered here.
 */
export function taskIdForPageUrl(url: string): string {
  const [path = "", search = ""] = url.split("?");
  const page = ROUTE_TO_PAGE.get(normalize(path));
  if (!page || !PAGES_WITH_DETAIL.has(page)) return "";
  return new URLSearchParams(search).get("task") ?? "";
}

/**
 * Which page an address names.
 *
 * Falls back to `today` for anything unrecognised — `/`, `/index.html` in the
 * packaged build, a stale bookmark. A 404 screen would be worse than the
 * landing page for an app whose whole surface is behind one origin.
 */
/**
 * Which of the four pages an address names, or `null` for everything else.
 *
 * It used to fall back to `today` — which meant every unrecognised address
 * drew the Today page at whatever URL it was given. There is no page left to
 * fall back TO: the Tasks Module owns every other address, and one that names
 * neither a page nor a Scope is redirected (`bootRedirectFor`) rather than
 * answered with a screen that does not match the bar.
 */
export function pageForPath(path: string): PageId | null {
  return ROUTE_TO_PAGE.get(normalize(path)) ?? null;
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
  // A retired address does NOT name a page any more: it names a redirect, and
  // saying otherwise here is what would leave the reader parked on it.
  if (RETIRED_ROUTES[normalized]) return false;
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
      // `/today`, `/inbox`, `/projects` and anything else stored by an older
      // build all mean the Tasks Module, which is where the Today that
      // survived P0-2 lives.
      return TASKS_HOME;
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
  if (normalized === "/login") return "";
  // A retired address is answered with its replacement, whatever the start
  // page is set to: the reader asked for something specific, and the thing
  // that replaced it is more specific than their default.
  const retired = RETIRED_ROUTES[normalized];
  if (retired) return retired;
  if (namesAPage(normalized)) return "";
  const target = pathForDefaultView(defaultView);
  return target === normalized ? "" : target;
}

/**
 * Where to go after signing in, when something sent the user to `/login` from
 * somewhere else.
 *
 * Only same-origin PATHS are honoured, and `//host` is rejected along with
 * anything absolute: a `returnTo` is a value from the address bar, so an open
 * redirect here would let a link that looks like FocusFlow's own login bounce
 * a freshly-authenticated user to somebody else's page.
 *
 * The one caller today is the OAuth consent screen (§6.4), which sends people
 * here when they are not signed in and needs them back afterwards.
 */
export function returnToFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("returnTo");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}
