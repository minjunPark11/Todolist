import type { Language, WeekStart } from "../types";

// Intl locale tag per app language. Callers that already have `lang` from
// useT() should pass it through; everything else defaults to English so this
// stays backwards compatible with call sites that haven't been updated yet.
function toIntlLocale(locale: Language): string {
  return locale === "ko" ? "ko" : "en";
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayValue(): string {
  return toDateInputValue(new Date());
}

export function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function addMonths(dateValue: string, months: number): string {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return toDateInputValue(date);
}

// Whole days from `from` to `to`, negative when `to` is the earlier date.
// Both are YYYY-MM-DD; parsing at local midnight keeps DST transitions from
// turning a whole number of days into 23.958.
export function daysBetween(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86400000);
}

export function isOverdue(dateValue: string): boolean {
  return Boolean(dateValue) && dateValue < todayValue();
}

export function isToday(dateValue: string): boolean {
  return dateValue === todayValue();
}

export function isThisWeek(dateValue: string): boolean {
  if (!dateValue) {
    return false;
  }

  const today = todayValue();
  const weekEnd = addDays(today, 6);
  return dateValue >= today && dateValue <= weekEnd;
}

export function getRecentDays(count: number): string[] {
  const today = todayValue();
  return Array.from({ length: count }, (_, index) => addDays(today, index - count + 1));
}

/**
 * The first day of the week `dateValue` falls in.
 *
 * SETTINGS_REVIEW.md 4.3: this used to subtract `getDay()` unadjusted, which is
 * Sunday and only Sunday. Sunday stays the default because it is what every
 * existing account has been showing — it was never a choice, so changing it
 * silently would move everyone's week.
 */
export function getWeekStart(dateValue = todayValue(), weekStart: WeekStart = "sunday"): string {
  const date = new Date(`${dateValue}T00:00:00`);
  const first = weekStart === "monday" ? 1 : 0;
  date.setDate(date.getDate() - ((date.getDay() - first + 7) % 7));
  return toDateInputValue(date);
}

/** Weekday labels rotated to start where the week does. */
export function rotateWeekdays<T>(labels: readonly T[], weekStart: WeekStart): T[] {
  if (weekStart !== "monday") return [...labels];
  return [...labels.slice(1), labels[0]];
}

export function isDateThisWeek(dateValue: string, week: WeekStart = "sunday"): boolean {
  if (!dateValue) {
    return false;
  }

  const weekStart = getWeekStart(todayValue(), week);
  const weekEnd = addDays(weekStart, 6);
  return dateValue >= weekStart && dateValue <= weekEnd;
}

export function formatDate(dateValue: string, locale: Language = "en"): string {
  if (!dateValue) {
    return locale === "ko" ? "날짜 없음" : "No date";
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), { month: "short", day: "numeric" }).format(
    new Date(`${dateValue}T00:00:00`),
  );
}

export function getMonthDays(anchor = new Date()): string[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const days: string[] = [];

  for (let day = first.getDate(); day <= last.getDate(); day += 1) {
    days.push(toDateInputValue(new Date(anchor.getFullYear(), anchor.getMonth(), day)));
  }

  return days;
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
}

export function getMonthGrid(year: number, month: number, weekStart: WeekStart = "sunday"): CalendarCell[] {
  const first = weekStart === "monday" ? 1 : 0;
  const startDay = (new Date(year, month, 1).getDay() - first + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - startDay);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return { date: toDateInputValue(date), inMonth: date.getMonth() === month };
  });
}

export function getMonthLabel(year: number, month: number, locale: Language = "en"): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), { month: "long", year: "numeric" }).format(
    new Date(year, month, 1),
  );
}

export function getDayNumber(dateValue: string): number {
  return Number(dateValue.slice(8, 10));
}

export function getWeekDays(anchor = todayValue(), weekStart: WeekStart = "sunday"): string[] {
  const start = getWeekStart(anchor, weekStart);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getWeekLabel(anchor: string, locale: Language = "en", weekStart: WeekStart = "sunday"): string {
  const start = getWeekStart(anchor, weekStart);
  const end = addDays(start, 6);
  const formatter = new Intl.DateTimeFormat(toIntlLocale(locale), { month: "short", day: "numeric" });
  return `${formatter.format(new Date(`${start}T00:00:00`))} – ${formatter.format(
    new Date(`${end}T00:00:00`),
  )}, ${start.slice(0, 4)}`;
}

export function getDayLabel(dateValue: string, locale: Language = "en"): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateValue}T00:00:00`));
}
