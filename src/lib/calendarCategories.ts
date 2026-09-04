// The little the calendar's left column has to store for itself.
//
// It used to store a whole taxonomy — personal categories, their names, their
// colours, their order, which one was default. All of that is a List now
// (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §4), and a List belongs to
// the account, not to this localStorage blob. What is left is three answers
// that are genuinely about this screen: which List new calendar tasks go into,
// which sources are switched off, and the focus recording's colour.
//
// Visibility is still stored as the INVERSE — what is hidden. Sources appear
// over time (a new List, a new subscription) and a new one must default to
// visible; a list of what is shown would silently hide everything made after
// it was written (§15.2).
import { useSyncExternalStore } from "react";
import { platform } from "../platform";
// The model moved to ./calendar/categoryModel so that code with no browser
// under it can read the ids and colours (§7.2). Re-exported here because this
// module was the door to them and every call site still knocks.
import { type CalendarCategoryState } from "./calendar/categoryModel";

export {
  CATEGORY_COLOR_PALETTE,
  FOCUS_ACTUAL_CATEGORY_ID,
  FOCUS_ACTUAL_COLOR,
  buildCalendarCategories,
  calendarLists,
  externalCategoryId,
  flattenCategories,
  isSourceVisible,
  type CalendarCategory,
  type CalendarCategoryGroup,
  type CalendarGroupType,
} from "./calendar/categoryModel";

const STORAGE_KEY = "focusflow.calendarCategories.v1";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * A stored blob, as this build reads it.
 *
 * The old shape had `personal`, `defaultCategoryId`, `activeCategoryId` and
 * `hiddenCategoryIds`. Two of those are gone with the taxonomy; the other two
 * are read once under their old names so nobody loses a hidden calendar or the
 * List their calendar creates into.
 *
 * `personal` and `defaultCategoryId` are deliberately NOT carried forward.
 * They named categories that nothing resolves any more (E3-A) — keeping them
 * would preserve a set of ids no screen can turn back into a colour.
 */
function sanitizeState(raw: Record<string, unknown> | null): CalendarCategoryState {
  const hidden = Array.isArray(raw?.hiddenSourceIds)
    ? raw.hiddenSourceIds
    : Array.isArray(raw?.hiddenCategoryIds)
      ? raw.hiddenCategoryIds
      : [];

  return {
    // An id that no longer resolves simply means "no default", and the caller
    // falls back to the Inbox — which is where an unfiled task goes anyway.
    activeListId:
      typeof raw?.activeListId === "string"
        ? raw.activeListId
        : typeof raw?.activeCategoryId === "string"
          ? ""
          : "",
    hiddenSourceIds: hidden.filter((id): id is string => typeof id === "string"),
    focusColor: typeof raw?.focusColor === "string" ? raw.focusColor : "",
    // Absent means an account that predates the setting, and those accounts
    // have never seen a finished block. `true` is what the design ships
    // (CALENDAR_TASK_CHECKBOX_DESIGN.md §1, D1-B).
    showCompleted: typeof raw?.showCompleted === "boolean" ? raw.showCompleted : true,
  };
}

function loadState(): CalendarCategoryState {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    return sanitizeState(raw ? (JSON.parse(raw) as Record<string, unknown>) : null);
  } catch {
    return sanitizeState(null);
  }
}

let state: CalendarCategoryState = loadState();
const listeners = new Set<() => void>();

function setState(next: CalendarCategoryState) {
  state = next;
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory state when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalendarCategoryState(): CalendarCategoryState {
  return useSyncExternalStore(subscribe, () => state);
}

// ---- state mutations (shared by sidebar / popover / settings) ----

/** Which List a task made on the calendar goes into. */
export function setActiveList(listId: string) {
  if (state.activeListId === listId) return;
  setState({ ...state, activeListId: listId });
}

/** Un-hide a source, so something written into it is not written out of view. */
export function ensureSourceVisible(sourceId: string) {
  if (!state.hiddenSourceIds.includes(sourceId)) return;
  setState({ ...state, hiddenSourceIds: state.hiddenSourceIds.filter((id) => id !== sourceId) });
}

export function toggleSourceVisibility(sourceId: string) {
  // Never touches activeListId (§16.2): hiding a List does not stop it being
  // the one new tasks go into, and silently moving that would be worse.
  setState({
    ...state,
    hiddenSourceIds: state.hiddenSourceIds.includes(sourceId)
      ? state.hiddenSourceIds.filter((id) => id !== sourceId)
      : [...state.hiddenSourceIds, sourceId],
  });
}

/**
 * Show or hide finished work on the grid
 * (CALENDAR_TASK_CHECKBOX_DESIGN.md §1, D1-B).
 */
export function toggleShowCompleted() {
  setState({ ...state, showCompleted: !state.showCompleted });
}

export function setFocusColor(color: string) {
  setState({ ...state, focusColor: color });
}
