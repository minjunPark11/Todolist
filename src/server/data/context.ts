// Who is asking, and what "now" means to them.
//
// Every query takes one of these rather than a bare `userId` (§7.3): a
// function that can be called without a token is a function that can be
// called for somebody who did not ask, and the access token is what PostgREST
// applies RLS with. Keeping them in one object means there is no signature
// anywhere in this layer that lets the token be forgotten.
import { invalidArgument } from "../errors";

export interface RequestContext {
  /** `sub` of the verified JWT. */
  userId: string;
  /** Passed straight to PostgREST; RLS does the rest. */
  accessToken: string;
  /** The OAuth client, for logging and policy. Absent for a session token. */
  clientId?: string;
  /** IANA zone. Resolved by `resolveTimezone`, never guessed. */
  timezone: string;
  now: Date;
}

/**
 * The account's zone, the caller's hint, or a refusal — in that order (M1).
 *
 * There is deliberately no third fallback. Every date this app stores is a
 * bare "YYYY-MM-DD" in local wall time, so without a zone the server cannot
 * say which day "today" is; UTC would be a guess that is wrong for most of
 * the planet for part of every day. An answer that is confidently one day out
 * is worse than a refusal the caller can act on, because nothing downstream
 * can detect it.
 */
export function resolveTimezone(stored: string | undefined, hint?: string): string {
  const candidate = (stored || "").trim() || (hint || "").trim();
  if (!candidate) {
    throw invalidArgument(
      "No time zone for this account. Sign in to the app once so it records one, or pass `timezone` (IANA, e.g. \"Asia/Seoul\").",
    );
  }
  if (!isValidTimezone(candidate)) {
    throw invalidArgument(`"${candidate}" is not an IANA time zone (expected something like "Asia/Seoul").`);
  }
  return candidate;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function partsIn(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return parts as unknown as ZonedParts;
}

/** "YYYY-MM-DD" as the user's calendar reads it — the app's date vocabulary. */
export function todayIn(now: Date, timezone: string): string {
  const parts = partsIn(now, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "HH:mm" in the user's zone, comparable with `Task.startTime`. */
export function timeIn(now: Date, timezone: string): string {
  const parts = partsIn(now, timezone);
  return `${parts.hour}:${parts.minute}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function dayOfWeekIn(now: Date, timezone: string): string {
  // Built from the zoned date rather than from `Intl`'s weekday name so the
  // answer is one fixed English vocabulary, not a locale's.
  const [year, month, day] = todayIn(now, timezone).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/**
 * Minutes the zone is ahead of UTC at this instant — DST included, because it
 * is computed at the instant rather than read off a table.
 */
export function zoneOffsetMinutes(now: Date, timezone: string): number {
  const parts = partsIn(now, timezone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  // Seconds are matched but milliseconds are not carried by the formatter, so
  // round to the nearest minute rather than letting sub-second drift show up.
  return Math.round((asUtc - now.getTime()) / 60000);
}

/** ISO 8601 with the user's own offset, e.g. "2026-08-28T09:15:00+09:00". */
export function zonedIsoString(now: Date, timezone: string): string {
  const parts = partsIn(now, timezone);
  const offset = zoneOffsetMinutes(now, timezone);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const hh = String(Math.floor(absolute / 60)).padStart(2, "0");
  const mm = String(absolute % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}

/** Minutes since midnight for "HH:mm"; undefined for anything else. */
export function minutesOfDay(time: string | undefined): number | undefined {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return undefined;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 24 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}
