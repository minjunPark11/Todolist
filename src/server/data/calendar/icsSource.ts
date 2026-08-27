// The user's subscribed calendars, read at question time (§9.2).
//
// The alternative was mirroring every event into our own tables. This is the
// cheaper build and the better failure: a mirror that broke three days ago
// looks exactly like a mirror that is up to date, so an AI would answer from
// stale meetings with full confidence. Fetching at question time means a
// failure is a failure NOW, and it is reported per calendar — "1 of your 2
// calendars could not be read" is something a reader can say out loud.
//
// It also keeps meeting titles, locations and attendee lists out of our
// database entirely (§16.1). What is held is a 5-minute in-memory cache of the
// parsed result, which dies with the serverless instance.
import type { ExternalCalendar, ExternalCalendarEvent } from "../../../types";
import { parseIcsEvents } from "../../../lib/ics/parse";
import { fetchIcsText, IcsFetchError, normalizeIcsUrl, type IcsFetchOptions } from "../../net/icsFetch";

/** §16.1: parsed in memory, never written down. */
export const CACHE_TTL_MS = 5 * 60 * 1000;
/** More than a personal account has; a stop against a runaway settings row. */
export const MAX_SUBSCRIPTIONS = 5;
/** The whole fetch phase, however many calendars there are (R7). */
export const TOTAL_BUDGET_MS = 12_000;

export interface ExternalCalendarStatus {
  name: string;
  ok: boolean;
  eventCount?: number;
  error?: string;
  fetchedAt?: string;
}

export interface ExternalEventsResult {
  events: ExternalCalendarEvent[];
  /** One row per subscription, in the order they are configured. */
  statuses: ExternalCalendarStatus[];
  /** True when at least one enabled subscription could not be read. */
  partial: boolean;
}

interface CacheEntry {
  events: ExternalCalendarEvent[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Tests and long-lived processes; a request never needs this. */
export function clearIcsCache(): void {
  cache.clear();
}

export interface LoadExternalEventsOptions extends IcsFetchOptions {
  now?: Date;
  /** Overrides the module cache. Tests pass a fresh map to stay isolated. */
  cacheTtlMs?: number;
}

/**
 * Every event from every enabled subscription, plus an honest account of what
 * failed.
 *
 * Failure never propagates: a calendar that times out costs its own events and
 * nothing else, because the question being asked ("what does my day look
 * like?") still has a mostly-true answer without it — and the status row says
 * which part is missing. §22-18 is exactly this.
 */
export async function loadExternalEvents(
  calendars: ExternalCalendar[],
  options: LoadExternalEventsOptions = {},
): Promise<ExternalEventsResult> {
  const { now = new Date(), cacheTtlMs = CACHE_TTL_MS, ...fetchOptions } = options;
  const enabled = calendars.filter((calendar) => calendar.enabled).slice(0, MAX_SUBSCRIPTIONS);

  if (enabled.length === 0) {
    return { events: [], statuses: [], partial: false };
  }

  const deadline = now.getTime() + TOTAL_BUDGET_MS;

  const settled = await Promise.all(
    enabled.map(async (calendar): Promise<{ status: ExternalCalendarStatus; events: ExternalCalendarEvent[] }> => {
      const cached = cache.get(calendar.icsUrl);
      if (cached && now.getTime() - cached.fetchedAt < cacheTtlMs) {
        return {
          events: cached.events,
          status: {
            name: calendar.name,
            ok: true,
            eventCount: cached.events.length,
            fetchedAt: new Date(cached.fetchedAt).toISOString(),
          },
        };
      }

      const url = normalizeIcsUrl(calendar.icsUrl);
      if (!url) {
        return { events: [], status: { name: calendar.name, ok: false, error: "That subscription URL is not allowed." } };
      }

      // Whatever is left of the shared budget, so five slow calendars cannot
      // add up to a request nobody is still waiting for.
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { events: [], status: { name: calendar.name, ok: false, error: "Ran out of time before this calendar." } };
      }

      try {
        const text = await fetchIcsText(url, {
          ...fetchOptions,
          timeoutMs: Math.min(fetchOptions.timeoutMs ?? Number.POSITIVE_INFINITY, remaining),
        });
        const events = parseIcsEvents(text, calendar.id);
        const fetchedAt = Date.now();
        cache.set(calendar.icsUrl, { events, fetchedAt });
        return {
          events,
          status: {
            name: calendar.name,
            ok: true,
            eventCount: events.length,
            fetchedAt: new Date(fetchedAt).toISOString(),
          },
        };
      } catch (error) {
        return {
          events: [],
          status: {
            name: calendar.name,
            ok: false,
            // An IcsFetchError says something a person can act on. Anything
            // else is ours to keep: an internal stack tells the user nothing
            // and tells an attacker something.
            error: error instanceof IcsFetchError ? error.message : "That calendar could not be read.",
          },
        };
      }
    }),
  );

  return {
    events: settled.flatMap((entry) => entry.events),
    statuses: settled.map((entry) => entry.status),
    partial: settled.some((entry) => !entry.status.ok),
  };
}
