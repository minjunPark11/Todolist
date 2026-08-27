// The calendar category model, with no store under it.
//
// The categories themselves are a data structure: three groups, a derived list
// per subscribed calendar, and rules for which of them are visible. WHERE the
// personal ones are kept — a localStorage blob read through a React store — is
// a separate matter, and it lives in ../calendarCategories.
//
// The split is not tidiness. `utils/calendarItems` needs the ids and the
// colours to build a day, and a server builds days now; importing them from
// the store module dragged React and a device along behind them (§7.2 of
// FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md).
import type { ExternalCalendar } from "../../types";

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

export interface StoredPersonalCategory {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarCategoryState {
  personal: StoredPersonalCategory[];
  defaultCategoryId: string;
  activeCategoryId: string;
  hiddenCategoryIds: string[];
  // User override for the focus-time category color ("" = FOCUS_ACTUAL_COLOR).
  focusColor: string;
}

// Shared swatch palette for category recoloring (settings modal + sidebar).
export const CATEGORY_COLOR_PALETTE = ["#0066cc", "#34c759", "#ff2d55", "#ff9500", "#af52de", "#5856d6", "#00b8a9", "#8e8e93"];

export const DEFAULT_PERSONAL_CATEGORY_ID = "cat-personal-default";

// System category for measured focus time (read-only; blocks are derived
// from completed FocusSession segments, never user-editable events).
export const FOCUS_ACTUAL_CATEGORY_ID = "cat-focus-actual";
export const FOCUS_ACTUAL_COLOR = "#0d9488";

const EXTERNAL_PREFIX = "cat-external:";

export function externalCategoryId(calendarId: string) {
  return `${EXTERNAL_PREFIX}${calendarId}`;
}

// ---- derived category list ----

export function buildCalendarCategories(input: {
  state: CalendarCategoryState;
  externalCalendars: ExternalCalendar[];
  // Display name for the focus-time category (i18n lives with the caller).
  focusCategoryName: string;
}): CalendarCategoryGroup[] {
  const personal: CalendarCategory[] = [...input.state.personal]
    .sort((a, b) => a.order - b.order)
    .map((category, order) => ({
      id: category.id,
      group: "personal" as const,
      name: category.name,
      color: category.color,
      order,
      isDefault: category.id === input.state.defaultCategoryId,
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

// External category visibility follows the calendar's own visible flag (it
// already exists and Settings toggles it); everything else uses the hidden
// list.
export function isCategoryVisible(
  categoryId: string,
  hiddenCategoryIds: string[],
  externalCalendars: ExternalCalendar[],
): boolean {
  if (categoryId.startsWith(EXTERNAL_PREFIX)) {
    const calendarId = categoryId.slice(EXTERNAL_PREFIX.length);
    const calendar = externalCalendars.find((item) => item.id === calendarId);
    return Boolean(calendar && calendar.enabled && calendar.visible);
  }
  return !hiddenCategoryIds.includes(categoryId);
}
