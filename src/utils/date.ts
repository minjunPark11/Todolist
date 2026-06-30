const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

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

export function getWeekStart(dateValue = todayValue()): string {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return toDateInputValue(date);
}

export function isDateThisWeek(dateValue: string): boolean {
  if (!dateValue) {
    return false;
  }

  const weekStart = getWeekStart();
  const weekEnd = addDays(weekStart, 6);
  return dateValue >= weekStart && dateValue <= weekEnd;
}

export function formatDate(dateValue: string): string {
  if (!dateValue) {
    return "No date";
  }

  return dateFormatter.format(new Date(`${dateValue}T00:00:00`));
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
