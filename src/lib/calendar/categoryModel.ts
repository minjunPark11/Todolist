// What the calendar's left column lists, with no store under it.
//
// Three groups still: the user's own calendars, one per subscribed calendar,
// and the focus recording. What changed is where the first group comes from
// (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §4). It used to be a set
// of categories that existed only here — invented, stored in localStorage, and
// settable from three `<select>`s inside the calendar. It is the account's
// LISTS now. The user keeps one taxonomy instead of two, and the colours on
// the grid are ones they chose while organising their work.
//
// The split from ../calendarCategories is not tidiness. `utils/calendarItems`
// needs the ids and the colours to build a day, and a server builds days now;
// importing them from the store module dragged React and a device along behind
// them (§7.2 of FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md).
import type { ExternalCalendar, List } from "../../types";
import { colorForList } from "../../domain/calendar/itemColor";

export type CalendarGroupType = "personal" | "external" | "focus";

export interface CalendarCategory {
  id: string;
  group: CalendarGroupType;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
  isReadOnly?: boolean;
  // Backing entity id for derived categories (external calendar id).
  sourceId?: string;
}

export interface CalendarCategoryGroup {
  type: CalendarGroupType;
  categories: CalendarCategory[];
}

export interface CalendarCategoryState {
  /**
   * Which List a task made on the calendar goes into.
   *
   * Was `activeCategoryId`, and answered the same question about a taxonomy
   * that no longer exists. Only the noun changed.
   */
  activeListId: string;
  /**
   * What the left column has switched off.
   *
   * Was `hiddenCategoryIds`, and now holds List ids beside the derived
   * category ids — the name stopped being true, so it changed. `sanitizeState`
   * reads the old key once so nobody's hidden calendars come back.
   */
  hiddenSourceIds: string[];
  // User override for the focus-time category color ("" = FOCUS_ACTUAL_COLOR).
  focusColor: string;
  /**
   * Whether finished work stays on the grid
   * (CALENDAR_TASK_CHECKBOX_DESIGN.md §1, D1-B).
   *
   * Moving to `appSettings.calendarViewOptions` with the View Options panel
   * (COLOR_SOURCE design §6.3) — it is a view option, and this store is
   * per-device localStorage while the app keeps view options on the account.
   */
  showCompleted: boolean;
}

// Swatch palette for recolouring what the calendar owns — a subscribed
// calendar and the focus recording. Lists are recoloured with the LIST
// palette (`domain/tasks/listColor`), because that is what the Tasks module
// offers for the same List: one List, one set of colours to pick from.
export const CATEGORY_COLOR_PALETTE = ["#0066cc", "#34c759", "#ff2d55", "#ff9500", "#af52de", "#5856d6", "#00b8a9", "#8e8e93"];

// System category for measured focus time (read-only; blocks are derived
// from completed FocusSession segments, never user-editable events).
export const FOCUS_ACTUAL_CATEGORY_ID = "cat-focus-actual";
export const FOCUS_ACTUAL_COLOR = "#0d9488";

const EXTERNAL_PREFIX = "cat-external:";

export function externalCategoryId(calendarId: string) {
  return `${EXTERNAL_PREFIX}${calendarId}`;
}

// ---- derived category list ----

/**
 * The Lists the calendar can draw, in the order the column lists them.
 *
 * §13.19: a List that is archived or deleted is out of every active query, and
 * so is everything in it. Dropping it here is also what removes its tasks from
 * the grid — `categoryAllowed` in `calendarItems` can only pass an id it can
 * see, so the two facts stay one fact.
 *
 * The Inbox goes first because it is where an unfiled task lands, and it has
 * no `order` of its own to sort by.
 */
export function calendarLists(lists: List[]): List[] {
  const active = lists.filter((list) => !list.archivedAt && !list.deletedAt);
  const inbox = active.filter((list) => list.kind === "inbox");
  const rest = active
    .filter((list) => list.kind !== "inbox")
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return [...inbox, ...rest];
}

export function buildCalendarCategories(input: {
  state: CalendarCategoryState;
  /** The first group IS the account's Lists now (design §4). */
  lists: List[];
  externalCalendars: ExternalCalendar[];
  // Display name for the focus-time category (i18n lives with the caller).
  focusCategoryName: string;
}): CalendarCategoryGroup[] {
  const personal: CalendarCategory[] = calendarLists(input.lists).map((list, order) => ({
    id: list.id,
    group: "personal" as const,
    name: list.name,
    // The same colour the grid paints, including the one made up for a List
    // nobody painted — otherwise the swatch beside a name would disagree with
    // every block that name owns.
    color: colorForList(list),
    order,
    isDefault: list.kind === "inbox",
  }));

  const external: CalendarCategory[] = input.externalCalendars
    .filter((calendar) => calendar.enabled)
    .map((calendar, order) => ({
      id: externalCategoryId(calendar.id),
      group: "external" as const,
      name: calendar.name,
      color: calendar.color,
      order,
      isReadOnly: true,
      sourceId: calendar.id,
    }));

  const focus: CalendarCategory[] = [
    {
      id: FOCUS_ACTUAL_CATEGORY_ID,
      group: "focus",
      name: input.focusCategoryName,
      color: input.state.focusColor || FOCUS_ACTUAL_COLOR,
      order: 0,
      isReadOnly: true,
    },
  ];

  return [
    { type: "personal", categories: personal },
    { type: "external", categories: external },
    { type: "focus", categories: focus },
  ];
}

export function flattenCategories(groups: CalendarCategoryGroup[]): Map<string, CalendarCategory> {
  const map = new Map<string, CalendarCategory>();
  for (const group of groups) {
    for (const category of group.categories) map.set(category.id, category);
  }
  return map;
}

/**
 * Whether the column is currently drawing this source.
 *
 * A subscribed calendar answers with its own `visible` flag — it already
 * exists, and Settings toggles it, so a second answer here could disagree with
 * the one the user set. Everything else — Lists, the focus recording — answers
 * from the hidden set.
 */
export function isSourceVisible(
  sourceId: string,
  hiddenSourceIds: string[],
  externalCalendars: ExternalCalendar[],
): boolean {
  if (sourceId.startsWith(EXTERNAL_PREFIX)) {
    const calendarId = sourceId.slice(EXTERNAL_PREFIX.length);
    const calendar = externalCalendars.find((item) => item.id === calendarId);
    return Boolean(calendar && calendar.enabled && calendar.visible);
  }
  return !hiddenSourceIds.includes(sourceId);
}
