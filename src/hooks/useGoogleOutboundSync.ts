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
import { isEmptyPlan, planOutbound, type IdentifiedTask } from "../domain/calendar/googleSync/outboundPlan";
import { currentAccessToken, readConnection } from "../lib/googleCalendar";
import { runOutbound, type OutboundOutcome } from "../lib/googleCalendarOutbound";
import type { Task } from "../types";

export interface GoogleOutboundSyncInput {
  tasks: Task[];
  /** `AppSettings.timezone` — the zone wall-clock times are written in (§9.2). */
  timezone: string;
  /** `AppSettings.googleDeletedEventIds` (§4.3). */
  tombstones: string[] | undefined;
  /** No FocusFlow session, no connection to look up. */
  signedIn: boolean;
  /** Where the earned mapping goes — `planner.applyGoogleSync`. */
  onResult: (outcome: OutboundOutcome) => void;
}

const DEBOUNCE_MS = 1800;

export function useGoogleOutboundSync({ tasks, timezone, tombstones, signedIn, onResult }: GoogleOutboundSyncInput) {
  // Read through refs so the timer always sends the CURRENT collection, and so
  // that neither a new callback identity nor a keystroke restarts the pass.
  const latest = useRef({ tasks, timezone, tombstones, signedIn, onResult });
  latest.current = { tasks, timezone, tombstones, signedIn, onResult };

  /** The connection, once found. Null until looked up; false when there is none. */
  const calendarId = useRef<string | null | false>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    const { tasks: current, timezone: zone, tombstones: orphans, signedIn: signed, onResult: report } = latest.current;
    if (!signed || running.current) return;

    const plan = planOutbound(current as unknown as IdentifiedTask[], orphans ?? []);
    if (isEmptyPlan(plan)) return;

    running.current = true;
    try {
      if (calendarId.current === null) {
        const connection = await readConnection();
        calendarId.current = connection?.calendarId ?? false;
      }
      if (!calendarId.current) return;

      const accessToken = await currentAccessToken();
      if (!accessToken) return;

      const outcome = await runOutbound({ plan, calendarId: calendarId.current, timezone: zone, accessToken });
      // A dead grant is not a transient failure. Forgetting the calendar makes
      // the next pass look the connection up again, which is what reconnecting
      // in Settings restores.
      if (outcome.expired) calendarId.current = null;
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
    return () => window.removeEventListener("focus", onFocus);
  }, [run]);
}
