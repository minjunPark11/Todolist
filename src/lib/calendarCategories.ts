// Calendar category model (FOCUSFLOW_CALENDAR_CATEGORY_MANAGEMENT_SPEC).
//
// Three-level structure: Group > Category > Event. Personal categories are
// user-managed and stored here; study / project / external categories are
// derived live from study topics, projects, and external calendars so their
// names and colors never drift from the source entities.
//
// Visibility: the spec models visibility as `visibleCategoryIds` on calendar
// state. Because derived categories appear over time (new project = new
// category that must default to visible), we persist the inverse —
// `hiddenCategoryIds` — and expose visible ids / isVisible helpers computed
// from it. Categories themselves never store an isVisible flag (§15.2).
import { useSyncExternalStore } from "react";
import type { ExternalCalendar, Project, StudyTopic } from "../types";

export type CalendarGroupType = "personal" | "study" | "project" | "external";

export interface CalendarCategory {
  id: string;
  group: CalendarGroupType;
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
  isReadOnly?: boolean;
  // Backing entity id for derived categories (topic / project / calendar id).
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
}

const STORAGE_KEY = "focusflow.calendarCategories.v1";
export const DEFAULT_PERSONAL_CATEGORY_ID = "cat-personal-default";

export function studyCategoryId(topicId: string) {
  return `cat-study:${topicId}`;
}

export function projectCategoryId(projectId: string) {
  return `cat-project:${projectId}`;
}

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
  };
}

function loadState(): CalendarCategoryState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

const STUDY_FALLBACK_COLOR = "#af52de";

export function buildCalendarCategories(input: {
  state: CalendarCategoryState;
  projects: Project[];
  studyTopics: StudyTopic[];
  externalCalendars: ExternalCalendar[];
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

  const study: CalendarCategory[] = input.studyTopics
    .filter((topic) => topic.status !== "archived")
    .map((topic, order) => ({
      id: studyCategoryId(topic.id),
      group: "study" as const,
      name: topic.name,
      color: topic.color || STUDY_FALLBACK_COLOR,
      order,
      sourceId: topic.id,
    }));

  const project: CalendarCategory[] = input.projects
    .filter((item) => item.status !== "archived")
    .map((item, order) => ({
      id: projectCategoryId(item.id),
      group: "project" as const,
      name: item.name,
      color: item.color,
      order,
      sourceId: item.id,
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

  return [
    { type: "personal", categories: personal },
    { type: "study", categories: study },
    { type: "project", categories: project },
    { type: "external", categories: external },
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
