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
// The model moved to ./calendar/categoryModel so that code with no browser
// under it can read the ids and colours (§7.2). Re-exported here because this
// module was the door to them and every call site still knocks.
import {
  DEFAULT_PERSONAL_CATEGORY_ID,
  FOCUS_ACTUAL_COLOR,
  type CalendarCategoryState,
  type StoredPersonalCategory,
} from "./calendar/categoryModel";

export {
  CATEGORY_COLOR_PALETTE,
  DEFAULT_PERSONAL_CATEGORY_ID,
  FOCUS_ACTUAL_CATEGORY_ID,
  FOCUS_ACTUAL_COLOR,
  buildCalendarCategories,
  externalCategoryId,
  flattenCategories,
  isCategoryVisible,
  type CalendarCategory,
  type CalendarCategoryGroup,
  type CalendarGroupType,
} from "./calendar/categoryModel";

const STORAGE_KEY = "focusflow.calendarCategories.v1";

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
    // Absent means an account that predates the setting, and those accounts
    // have never seen a finished block. `true` is what the design ships
    // (§1, D1-B); only an explicit `false` hides them.
    showCompleted: typeof raw?.showCompleted === "boolean" ? raw.showCompleted : true,
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

/**
 * Show or hide finished work on the grid (§1, D1-B).
 *
 * Not a category — a category answers "whose calendar is this" and this
 * answers "is it still to do". They share the sidebar and this store because
 * they share the question underneath both: what gets drawn.
 */
export function toggleShowCompleted() {
  setState({ ...state, showCompleted: !state.showCompleted });
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

