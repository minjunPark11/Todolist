// Shallow natural-language parsing for the Today capture bar
// (USABILITY_IMPROVEMENT_DESIGN.md §4.B).
//
// This is deliberately not a date library. It recognises a short list of
// explicit patterns, strips them from the title, and hands back structured
// fields — the capture bar renders those as chips before saving, so a wrong
// read is visible and correctable rather than silently stored. Anything that
// is not one of the patterns below is left in the title untouched.
import type { Project, TaskPriority } from "../types";
import { platform } from "../platform";
import { addDays, todayValue, toDateInputValue } from "./date";

const CAPTURE_TARGET_KEY = "todayPage.captureTarget.v1";

/**
 * Whether the capture bar files new items as Today tasks (true) or Inbox items
 * (false). Remembered across sessions — capture habits differ per person, and
 * re-picking on every capture defeats the point of a one-line bar.
 */
export function loadCaptureTarget(): boolean {
  try {
    // Defaults to Today so existing capture behaviour is unchanged; the Inbox
    // route is one visible toggle away.
    return platform.storage.getSync(CAPTURE_TARGET_KEY) !== "inbox";
  } catch {
    return true;
  }
}

export function saveCaptureTarget(addToToday: boolean) {
  try {
    platform.storage.setSync(CAPTURE_TARGET_KEY, addToToday ? "today" : "inbox");
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts the session.
  }
}

export interface QuickParseResult {
  title: string;
  /** Relative day words ("내일", "monday") — when to work on it. "" when absent. */
  scheduledDate: string;
  /** Explicit calendar dates ("3/15", "2026-03-15") — the deadline. "" when absent. */
  dueDate: string;
  /** 24h "HH:MM". "" when absent. */
  startTime: string;
  projectId: string;
  priority: TaskPriority | "";
}

interface QuickParseOptions {
  projects: Project[];
  today?: string;
}

const WEEKDAYS: Array<{ index: number; patterns: string[] }> = [
  { index: 0, patterns: ["일요일", "sunday", "sun"] },
  { index: 1, patterns: ["월요일", "monday", "mon"] },
  { index: 2, patterns: ["화요일", "tuesday", "tue"] },
  { index: 3, patterns: ["수요일", "wednesday", "wed"] },
  { index: 4, patterns: ["목요일", "thursday", "thu"] },
  { index: 5, patterns: ["금요일", "friday", "fri"] },
  { index: 6, patterns: ["토요일", "saturday", "sat"] },
];

const PRIORITY_WORDS: Array<{ value: TaskPriority; patterns: string[] }> = [
  { value: "high", patterns: ["높음", "high"] },
  { value: "medium", patterns: ["보통", "medium"] },
  { value: "low", patterns: ["낮음", "low"] },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Latin words need boundaries so "monday" doesn't fire inside "mondayish", but
// \b does not work against Hangul — those patterns are matched as-is.
function wordPattern(word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /^[a-z]+$/i.test(word) ? `\\b${escaped}\\b` : escaped;
}

/**
 * The next date with this weekday, always in the future — typing "월요일" on a
 * Monday means the coming Monday, not today. Use "오늘" for today.
 */
function nextWeekday(today: string, weekdayIndex: number): string {
  const todayIndex = new Date(`${today}T00:00:00`).getDay();
  const delta = (weekdayIndex - todayIndex + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

/** Builds YYYY-MM-DD, rolling to next year when the day already passed. */
function resolveMonthDay(today: string, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const year = Number(today.slice(0, 4));
  const candidate = new Date(year, month - 1, day);
  // Reject impossible days (2/31) rather than letting Date roll them over.
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return "";
  const value = toDateInputValue(candidate);
  return value < today ? toDateInputValue(new Date(year + 1, month - 1, day)) : value;
}

export function parseQuickCapture(input: string, options: QuickParseOptions): QuickParseResult {
  const today = options.today ?? todayValue();
  const result: QuickParseResult = {
    title: "",
    scheduledDate: "",
    dueDate: "",
    startTime: "",
    projectId: "",
    priority: "",
  };

  let rest = input;

  // Removes the first match and reports its capture groups.
  function take(pattern: RegExp): RegExpMatchArray | null {
    const match = rest.match(pattern);
    if (!match) return null;
    rest = `${rest.slice(0, match.index)} ${rest.slice((match.index ?? 0) + match[0].length)}`;
    return match;
  }

  // --- explicit dates → dueDate ---
  const isoDate = take(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDate) {
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      result.dueDate = `${isoDate[1]}-${pad(month)}-${pad(day)}`;
    }
  }

  if (!result.dueDate) {
    const koreanDate = take(/(\d{1,2})월\s*(\d{1,2})일/);
    if (koreanDate) {
      result.dueDate = resolveMonthDay(today, Number(koreanDate[1]), Number(koreanDate[2]));
    }
  }

  if (!result.dueDate) {
    // Guarded so it can't eat the "3/15" inside a time range or a fraction.
    const slashDate = take(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s|$)/);
    if (slashDate) {
      result.dueDate = resolveMonthDay(today, Number(slashDate[1]), Number(slashDate[2]));
    }
  }

  // --- relative days → scheduledDate ---
  if (take(/(?:오늘|\btoday\b)/i)) {
    result.scheduledDate = today;
  } else if (take(/(?:내일|\btomorrow\b)/i)) {
    result.scheduledDate = addDays(today, 1);
  } else if (take(/모레/)) {
    result.scheduledDate = addDays(today, 2);
  } else {
    for (const weekday of WEEKDAYS) {
      const match = take(new RegExp(weekday.patterns.map(wordPattern).join("|"), "i"));
      if (match) {
        result.scheduledDate = nextWeekday(today, weekday.index);
        break;
      }
    }
  }

  // --- times → startTime ---
  const koreanTime = take(/(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
  if (koreanTime) {
    let hour = Number(koreanTime[2]);
    if (hour >= 1 && hour <= 12) {
      if (koreanTime[1] === "오후" && hour !== 12) hour += 12;
      if (koreanTime[1] === "오전" && hour === 12) hour = 0;
      result.startTime = `${pad(hour)}:${pad(Number(koreanTime[3] ?? 0))}`;
    }
  }

  if (!result.startTime) {
    const clockTime = take(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (clockTime) {
      result.startTime = `${pad(Number(clockTime[1]))}:${clockTime[2]}`;
    }
  }

  if (!result.startTime) {
    const meridiemTime = take(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
    if (meridiemTime) {
      let hour = Number(meridiemTime[1]);
      if (hour >= 1 && hour <= 12) {
        if (meridiemTime[3].toLowerCase() === "pm" && hour !== 12) hour += 12;
        if (meridiemTime[3].toLowerCase() === "am" && hour === 12) hour = 0;
        result.startTime = `${pad(hour)}:${pad(Number(meridiemTime[2] ?? 0))}`;
      }
    }
  }

  // --- #space → projectId (only when exactly one project matches) ---
  const spaceTag = rest.match(/#(\S+)/);
  if (spaceTag) {
    const needle = spaceTag[1].toLowerCase();
    const exact = options.projects.filter((project) => project.name.toLowerCase() === needle);
    const partial = options.projects.filter((project) =>
      project.name.toLowerCase().startsWith(needle),
    );
    const matches = exact.length > 0 ? exact : partial;
    if (matches.length === 1) {
      result.projectId = matches[0].id;
      rest = `${rest.slice(0, spaceTag.index)} ${rest.slice((spaceTag.index ?? 0) + spaceTag[0].length)}`;
    }
  }

  // --- !priority ---
  if (take(/!!/)) {
    result.priority = "high";
  } else {
    for (const priority of PRIORITY_WORDS) {
      const match = take(new RegExp(`!(?:${priority.patterns.map(wordPattern).join("|")})`, "i"));
      if (match) {
        result.priority = priority.value;
        break;
      }
    }
  }

  result.title = rest.replace(/\s+/g, " ").trim();
  return result;
}
