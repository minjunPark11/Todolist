// Running the outbound pass at the moments §6.4 asks for
// (GOOGLE_CALENDAR_SYNC_DESIGN.md M1-5).
//
// The pass itself is pure planning plus one executor; this is only about WHEN.
// Two triggers, both cheap: a debounce after the Task collection changes — the
// same 1.8 seconds the ICS republish uses, so an edit reaches Google in about
// the time it takes to stop typing — and the window regaining focus, which
// catches everything that happened while the app was in the background.
//
// The safety of running it often rests on one thing: `isEmptyPlan` is checked
// BEFORE an access token is asked for. A pass with nothing to do costs no
// request at all, which is what stops the write-back from feeding itself — the
// mapping it stores changes the Tasks, which re-arms the debounce, which plans
// nothing and stops.
import { useCallback, useEffect, useRef } from "react";
import {
  isEmptyPlan,
  planOutbound,
  reserveEventIds,
  type IdentifiedTask,
} from "../domain/calendar/googleSync/outboundPlan";
import { newGoogleEventId } from "../domain/calendar/googleSync/eventShape";
import {
  currentAccessToken,
  ensureDedicatedCalendar,
  GOOGLE_CONNECTION_CHANGED,
  notifyGoogleConnectionChanged,
  readConnection,
} from "../lib/googleCalendar";
import { runOutbound, type EventMapping } from "../lib/googleCalendarOutbound";
import type { EventReservation } from "../domain/calendar/googleSync/outboundPlan";
import type { Task } from "../types";

export interface GoogleOutboundSyncInput {
  tasks: Task[];
  /** `AppSettings.timezone` — the zone wall-clock times are written in (§9.2). */
  timezone: string;
  /** `AppSettings.googleDeletedEventIds` (§4.3). */
  tombstones: string[] | undefined;
  /** No FocusFlow session, no connection to look up. */
  signedIn: boolean;
  /**
   * Where what the pass learned goes — `planner.applyGoogleSync`.
   *
   * Called twice in a pass that creates anything: once with the reserved ids
   * BEFORE the requests go out (§3.4), and once with the outcome after. An
   * `OutboundOutcome` satisfies this shape, so the second call passes it
   * whole.
   */
  onResult: (result: {
    mapped?: readonly EventMapping[];
    unlinked?: readonly string[];
    clearedOrphans?: readonly string[];
    reserved?: readonly EventReservation[];
    unusableReservations?: readonly string[];
  }) => void;
}

const DEBOUNCE_MS = 1800;

export function useGoogleOutboundSync({ tasks, timezone, tombstones, signedIn, onResult }: GoogleOutboundSyncInput) {
  // Read through refs so the timer always sends the CURRENT collection, and so
  // that neither a new callback identity nor a keystroke restarts the pass.
  const latest = useRef({ tasks, timezone, tombstones, signedIn, onResult });
  latest.current = { tasks, timezone, tombstones, signedIn, onResult };

  const running = useRef(false);

  const run = useCallback(async () => {
    const { tasks: current, timezone: zone, tombstones: orphans, signedIn: signed, onResult: report } = latest.current;
    if (!signed || running.current) return;

    const planned = planOutbound(current as unknown as IdentifiedTask[], orphans ?? []);
    if (isEmptyPlan(planned)) return;

    // Every event this pass creates is named before it is sent, and the names
    // are written down first (§3.4). That order is the whole of the duplicate
    // fix: if the response to a create is lost, the id survives on the Task and
    // the retry names the same event instead of making a second one.
    //
    // The ids go into the plan directly rather than being read back out of
    // state — waiting for a render would split the pass in two and open the
    // very window this closes.
    const { create, reservations } = reserveEventIds(planned.create, newGoogleEventId);
    const plan = { ...planned, create };
    if (reservations.length > 0) report({ reserved: reservations });

    running.current = true;
    try {
      // Re-read per pass: a cached absence survived connecting in Settings,
      // and a cached ID survived disconnecting or switching accounts.
      const connection = await readConnection();
      if (!connection) return;

      const accessToken = await currentAccessToken();
      if (!accessToken) return;

      const outcome = await runOutbound({ plan, calendarId: connection.calendarId, timezone: zone, accessToken });

      // The calendar we write to is not in the account any more — deleted in
      // Google, most likely (§7.3). Nothing in the outcome may be applied: the
      // pass stopped at the first 404 precisely so that it would not unlink
      // every Task on the way down. Making the calendar again is the recovery,
      // and it is the same call the connect flow uses; the ids the Tasks still
      // hold point into the old one, so each will 404 once against the new
      // calendar, unlink, and be created afresh.
      if (outcome.calendarMissing) {
        await ensureDedicatedCalendar(accessToken);
        notifyGoogleConnectionChanged();
        return;
      }

      report(outcome);
    } catch {
      // Whatever went wrong, nothing was written down, so the next trigger
      // simply tries again with the same plan.
    } finally {
      running.current = false;
    }
  }, []);

  // After an edit settles.
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [tasks, tombstones, signedIn, run]);

  // And on the way back to the window (§6.4).
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
