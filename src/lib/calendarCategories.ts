// Calendar category model (FOCUSFLOW_CALENDAR_CATEGORY_MANAGEMENT_SPEC).
//
// Three-level structure: Group > Category > Event. Personal categories are
// user-managed and stored here; external categories are derived live from the
// subscribed calendars so their names and colors never drift from the source.
//
// A `project` group sat beside them, one category per Project. Projects are
// gone from the app, and a category nothing can be filed under is a filter
// row that only ever hides things.
//
// Visibility: the spec models visibility as `visibleCategoryIds` on calendar
// state. Because derived categories appear over time (new project = new
// category that must default to visible), we persist the inverse —
// `hiddenCategoryIds` — and expose visible ids / isVisible helpers computed
// from it. Categories themselves never store an isVisible flag (§15.2).
import { useSyncExternalStore } from "react";
import { platform } from "../platform";
import type { ExternalCalendar } from "../types";

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

interface StoredPersonalCategory {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CalendarCategoryState {
  personal: StoredPersonalCategory[];
  defaultCategoryId: string;
  activeCategoryId: string;
  hiddenCategoryIds: string[];
  // User override for the focus-time category color ("" = FOCUS_ACTUAL_COLOR).
  focusColor: string;
}

// Shared swatch palette for category recoloring (settings modal + sidebar).
export const CATEGORY_COLOR_PALETTE = ["#0066cc", "#34c759", "#ff2d55", "#ff9500", "#af52de", "#5856d6", "#00b8a9", "#8e8e93"];

const STORAGE_KEY = "focusflow.calendarCategories.v1";
export const DEFAULT_PERSONAL_CATEGORY_ID = "cat-personal-default";

// System category for measured focus time (read-only; blocks are derived
// from completed FocusSession segments, never user-editable events).
export const FOCUS_ACTUAL_CATEGORY_ID = "cat-focus-actual";
export const FOCUS_ACTUAL_COLOR = "#0d9488";

export function externalCategoryId(calendarId: string) {
  return `cat-external:${calendarId}`;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seedPersonalCategories(): StoredPersonalCategory[] {
  const now = new Date().toISOString();
  return [
    { id: DEFAULT_PERSONAL_CATEGORY_ID, name: "기본 일정", color: "#0066cc", order: 0, isDefault: true, createdAt: now, updatedAt: now },
    { id: createId("cat-personal"), name: "개인", color: "#34c759", order: 1, createdAt: now, updatedAt: now },
    { id: createId("cat-personal"), name: "약속", color: "#ff2d55", order: 2, createdAt: now, updatedAt: now },
  ];
}

// Migration (§15.6): the default category must always exist; the ids the
// state references must stay resolvable.
function sanitizeState(raw: Partial<CalendarCategoryState> | null): CalendarCategoryState {
  let personal = Array.isArray(raw?.personal)
    ? raw.personal.filter((item): item is StoredPersonalCategory => Boolean(item && item.id && item.name))
    : [];
  if (personal.length === 0) personal = seedPersonalCategories();

  let defaultCategoryId = typeof raw?.defaultCategoryId === "string" ? raw.defaultCategoryId : "";
  if (!personal.some((category) => category.id === defaultCategoryId)) {
    const flagged = personal.find((category) => category.isDefault);
    defaultCategoryId = flagged?.id ?? personal[0].id;
  }
  personal = personal.map((category) => ({ ...category, isDefault: category.id === defaultCategoryId }));

  return {
    personal: [...personal].sort((a, b) => a.order - b.order).map((category, index) => ({ ...category, order: index })),
    defaultCategoryId,
    activeCategoryId: typeof raw?.activeCategoryId === "string" ? raw.activeCategoryId : defaultCategoryId,
    hiddenCategoryIds: Array.isArray(raw?.hiddenCategoryIds) ? raw.hiddenCategoryIds.filter((id): id is string => typeof id === "string") : [],
    focusColor: typeof raw?.focusColor === "string" ? raw.focusColor : "",
  };
}

function loadState(): CalendarCategoryState {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    return sanitizeState(raw ? (JSON.parse(raw) as Partial<CalendarCategoryState>) : null);
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

export function setActiveCategory(categoryId: string) {
  if (state.activeCategoryId === categoryId) return;
  setState({ ...state, activeCategoryId: categoryId });
}

export function ensureCategoryVisible(categoryId: string) {
  if (!state.hiddenCategoryIds.includes(categoryId)) return;
  setState({ ...state, hiddenCategoryIds: state.hiddenCategoryIds.filter((id) => id !== categoryId) });
}

export function toggleCategoryVisibility(categoryId: string) {
  // Never touches activeCategoryId (§16.2).
  setState({
    ...state,
    hiddenCategoryIds: state.hiddenCategoryIds.includes(categoryId)
      ? state.hiddenCategoryIds.filter((id) => id !== categoryId)
      : [...state.hiddenCategoryIds, categoryId],
  });
}

export function addPersonalCategory(name: string, color: string): string {
  const now = new Date().toISOString();
  const id = createId("cat-personal");
  setState({
    ...state,
    personal: [...state.personal, { id, name: name.trim(), color, order: state.personal.length, createdAt: now, updatedAt: now }],
  });
  return id;
}

export function updatePersonalCategory(categoryId: string, patch: Partial<Pick<StoredPersonalCategory, "name" | "color">>) {
  setState({
    ...state,
    personal: state.personal.map((category) =>
      category.id === categoryId ? { ...category, ...patch, updatedAt: new Date().toISOString() } : category,
    ),
  });
}

export function movePersonalCategory(categoryId: string, direction: -1 | 1) {
  const sorted = [...state.personal].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((category) => category.id === categoryId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= sorted.length) return;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  setState({ ...state, personal: sorted.map((category, order) => ({ ...category, order })) });
}

// Drag & drop reorder: drops the category at targetIndex in the sorted list.
export function movePersonalCategoryTo(categoryId: string, targetIndex: number) {
  const sorted = [...state.personal].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((category) => category.id === categoryId);
  if (from === -1) return;
  const to = Math.max(0, Math.min(sorted.length - 1, targetIndex));
  if (from === to) return;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  setState({ ...state, personal: sorted.map((category, order) => ({ ...category, order })) });
}

export function setFocusColor(color: string) {
  setState({ ...state, focusColor: color });
}

export function setDefaultCategory(categoryId: string) {
  if (!state.personal.some((category) => category.id === categoryId)) return;
  setState({
    ...state,
    defaultCategoryId: categoryId,
    personal: state.personal.map((category) => ({ ...category, isDefault: category.id === categoryId })),
  });
}

// Deletes a personal category and cleans up every reference (§8.4). Event
// migration (task.categoryId rewrites) is the caller's job — this only
// handles the category store's own state.
export function deletePersonalCategory(categoryId: string): boolean {
  if (categoryId === state.defaultCategoryId) return false;
  if (!state.personal.some((category) => category.id === categoryId)) return false;
  setState({
    ...state,
    personal: state.personal
      .filter((category) => category.id !== categoryId)
      .sort((a, b) => a.order - b.order)
      .map((category, order) => ({ ...category, order })),
    hiddenCategoryIds: state.hiddenCategoryIds.filter((id) => id !== categoryId),
    activeCategoryId: state.activeCategoryId === categoryId ? state.defaultCategoryId : state.activeCategoryId,
  });
  return true;
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
  if (categoryId.startsWith("cat-external:")) {
    const calendarId = categoryId.slice("cat-external:".length);
    const calendar = externalCalendars.find((item) => item.id === calendarId);
    return Boolean(calendar && calendar.enabled && calendar.visible);
  }
  return !hiddenCategoryIds.includes(categoryId);
}
