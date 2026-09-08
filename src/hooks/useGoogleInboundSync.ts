// Running the inbound pass at the moments §6.4 asks for
// (GOOGLE_CALENDAR_SYNC_DESIGN.md M2).
//
// The pass itself is `lib/googleCalendarInbound.ts`; this is about WHEN, and
// about the one piece of bookkeeping that has nowhere else to live: keeping the
// local list of external calendars in step with the calendars this account
// chose in Settings.
//
// No debounce, unlike the outbound hook. Outbound is triggered by the user's
// own typing and has to wait for it to settle; inbound is triggered by the
// window coming back, which has already settled by definition. §6.4 asks for
// app open, window focus, and the rail's sync button — the first two are here
// and the third arrives as the same connection event.
import { useCallback, useEffect, useRef } from "react";
import { applyInboundPlan, pruneAfterFullListing, runInbound } from "../lib/googleCalendarInbound";
import { currentAccessToken, GOOGLE_CONNECTION_CHANGED, googleCalendarFetch } from "../lib/googleCalendar";
import { readGoogleSources, saveGoogleSyncToken, type GoogleCalendarSource } from "../lib/googleCalendarSources";
import type { KnownEvent } from "../domain/calendar/googleSync/inboundPlan";
import type { ExternalCalendar, ExternalCalendarEvent } from "../types";

export interface ExternalState {
  calendars: ExternalCalendar[];
  events: ExternalCalendarEvent[];
}

export interface GoogleInboundSyncInput {
  /** No FocusFlow session, no sources to read. */
  signedIn: boolean;
  /** `App`'s `saveExternalState` — updates state and persists it. */
  apply: (updater: (current: ExternalState) => ExternalState) => void;
}

/** The local id for a Google calendar. Deterministic, so a reload finds it. */
export function localIdFor(calendarId: string): string {
  return `google:${calendarId}`;
}

/**
 * The local calendar list, matched to what the account chose.
 *
 * Pure, and separate, because it is the part with an edge worth testing: a
 * calendar the person turned OFF must take its events with it, and one that is
 * merely absent from this round's sources — a read that failed, a row not
 * written yet — must not.
 */
export function reconcileGoogleCalendars(current: ExternalState, sources: GoogleCalendarSource[]): ExternalState {
  const selected = new Map(sources.filter((source) => source.selected).map((s) => [localIdFor(s.calendarId), s]));
  const known = new Set(sources.map((source) => localIdFor(source.calendarId)));

  const calendars: ExternalCalendar[] = [];
  for (const calendar of current.calendars) {
    if ((calendar.source ?? "ics") !== "google") {
      calendars.push(calendar);
      continue;
    }
    const source = selected.get(calendar.id);
    if (source) {
      calendars.push({ ...calendar, name: source.summary || calendar.name, color: source.color || calendar.color });
      continue;
    }
    // Dropped only when this account is KNOWN to hold a row saying otherwise.
    // A calendar missing from `sources` entirely is a list we could not read,
    // and forgetting it then would delete a person's events over a timeout.
    if (!known.has(calendar.id)) calendars.push(calendar);
  }

  const now = new Date().toISOString();
  for (const [id, source] of selected) {
    if (calendars.some((calendar) => calendar.id === id)) continue;
    calendars.push({
      id,
      name: source.summary || source.calendarId,
      source: "google",
      googleCalendarId: source.calendarId,
      color: source.color || "#4f73ff",
      visible: true,
      enabled: true,
      syncStatus: "idle",
      eventCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  const live = new Set(calendars.map((calendar) => calendar.id));
  return { calendars, events: current.events.filter((event) => live.has(event.externalCalendarId)) };
}

/** What we hold for one calendar, in the shape `planInbound` compares against. */
function knownFor(events: readonly ExternalCalendarEvent[], calendarId: string): Map<string, KnownEvent> {
  const known = new Map<string, KnownEvent>();
  for (const event of events) {
    if (event.externalCalendarId !== calendarId) continue;
    known.set(event.externalUid, {
      ...(event.etag ? { etag: event.etag } : {}),
      ...(event.createdAt ? { createdAt: event.createdAt } : {}),
    });
  }
  return known;
}

export function useGoogleInboundSync({ signedIn, apply }: GoogleInboundSyncInput) {
  const latest = useRef({ signedIn, apply });
  latest.current = { signedIn, apply };

  const running = useRef(false);

  const run = useCallback(async () => {
    const { signedIn: signed, apply: update } = latest.current;
    if (!signed || running.current) return;
    running.current = true;
    try {
      const sources = await readGoogleSources();

      // Even with nothing selected this has to run: it is what removes a
      // calendar the person just turned off.
      let snapshot: ExternalState = { calendars: [], events: [] };
      update((current) => {
        snapshot = reconcileGoogleCalendars(current, sources);
        return snapshot;
      });

      const chosen = sources.filter((source) => source.selected);
      if (chosen.length === 0) return;

      const accessToken = await currentAccessToken();
      if (!accessToken) return;

      for (const source of chosen) {
        const externalCalendarId = localIdFor(source.calendarId);
        const outcome = await runInbound(
          {
            externalCalendarId,
            googleCalendarId: source.calendarId,
            writable: source.writable,
            ...(source.timezone ? { defaultTimezone: source.timezone } : {}),
            ...(source.syncToken ? { syncToken: source.syncToken } : {}),
            known: knownFor(snapshot.events, externalCalendarId),
            accessToken,
          },
          { fetch: googleCalendarFetch },
        );

        // A dead grant fails every remaining calendar the same way.
        if (outcome.expired) return;
        if (outcome.failed) continue;

        update((current) => {
          const applied = applyInboundPlan(current.events, externalCalendarId, outcome.plan);
          // The only place absence is read as deletion, and only on the listing
          // that proved it carries the whole calendar (§4). This is what clears
          // an event deleted in Google while our cursor was expired — until
          // this existed, such an event stayed on the grid forever, and the
          // only way out was turning the calendar off and on again.
          const next = {
            calendars: current.calendars,
            events: outcome.complete
              ? pruneAfterFullListing(applied, externalCalendarId, new Set(outcome.plan.seen))
              : applied,
          };
          snapshot = next;
          return next;
        });

        // Written only after the plan landed. A cursor stored ahead of the
        // events it describes would skip them forever on the next pass.
        if (outcome.syncToken && outcome.syncToken !== source.syncToken) {
          await saveGoogleSyncToken(source.calendarId, outcome.syncToken);
        }
      }
    } catch {
      // Nothing was written down that a later pass cannot redo, and a failed
      // read must never be allowed to look like a set of deletions (§7.1).
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void run();
  }, [signedIn, run]);

  useEffect(() => {
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    window.addEventListener(GOOGLE_CONNECTION_CHANGED, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(GOOGLE_CONNECTION_CHANGED, onFocus);
    };
  }, [run]);
}
