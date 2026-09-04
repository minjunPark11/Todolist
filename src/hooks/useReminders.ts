// Delivery for the schedule editor's 알림 (design §8, audit D5).
//
// The effectful half: a clock, the platform's notification channel, and a
// memory of what has already fired. Every decision lives in
// `domain/schedule/reminderQueue.ts` — this hook only asks it what is due and
// hands the answer to the OS.
//
// Why a foreground poll rather than a scheduled OS notification: the app has
// no background service, and Tauri's notification plugin fires on demand
// rather than on a schedule. So a reminder arrives when the app is running,
// which is an honest limitation of the current shape and is why the notice
// beside the reminder panel does not promise otherwise.
import { useEffect, useRef } from "react";
import {
  pruneSeen,
  reminderKey,
  sweepReminders,
  type LocalMoment,
  type ReminderTaskSource,
} from "../domain/schedule/reminderQueue";
import { platform } from "../platform";
import { recordNotification } from "../lib/notificationStore";

/**
 * How often to look.
 *
 * Reminders are minute-resolution, and half a minute keeps the worst case
 * under one — checking every second would burn a wake-up per second to be
 * right about something that changes sixty times more slowly.
 */
const TICK_MS = 30_000;

const STORAGE_KEY = "focusflow.remindersFired.v1";

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : []);
  } catch {
    // A corrupt record means we may repeat a notification once, which is a
    // far smaller failure than refusing to start.
    return new Set();
  }
}

function writeSeen(keys: Set<string>, now: LocalMoment) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneSeen([...keys], now)));
  } catch {
    // Storage full or blocked: the in-memory set still prevents repeats for
    // this session, which is the case that matters most.
  }
}

/** The wall clock as the domain's `{date, time}` — local, never UTC. */
function nowMoment(): LocalMoment {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

interface RemindersOptions {
  tasks: readonly ReminderTaskSource[];
  /** Title and body for one reminder, so the wording stays in the i18n layer. */
  describe: (reminder: { title: string; at: LocalMoment }) => { title: string; body: string };
  /** Shown when the OS refuses or has no permission, matching the focus timer. */
  onFallback?: (message: string) => void;
}

export function useReminders({ tasks, describe, onFallback }: RemindersOptions) {
  const seenRef = useRef<Set<string> | null>(null);
  // Held in a ref and refreshed every render so the interval below can be set
  // up once: re-creating it whenever a task changed would reset the countdown
  // on every keystroke in a task title, and reminders would drift late.
  const latest = useRef({ tasks, describe, onFallback });
  latest.current = { tasks, describe, onFallback };

  // Nothing is requested here any more. This asked for notification permission
  // on mount, which put the browser's prompt on first load before the user had
  // asked for anything — the timing §6.39 refuses. The request lives in the
  // reminder panel now, at the moment someone chooses a reminder, and this
  // hook only delivers.

  useEffect(() => {
    if (seenRef.current === null) seenRef.current = readSeen();

    function tick() {
      const seen = seenRef.current;
      if (seen === null) return;

      const now = nowMoment();
      const { due, expired } = sweepReminders(latest.current.tasks, now, seen);
      if (due.length === 0 && expired.length === 0) return;

      // Recorded BEFORE firing. A notification that throws must not be retried
      // every thirty seconds for the rest of the day.
      for (const key of expired) seen.add(key);
      for (const reminder of due) seen.add(reminder.key);
      writeSeen(seen, now);

      for (const reminder of due) {
        const { title, body } = latest.current.describe(reminder);
        // Kept as well as fired (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §3.2).
        // This poll only runs while the app is open, so a reminder that came
        // due overnight is one nobody will ever see unless it is written down
        // — which is the whole reason the bell has something to show.
        recordNotification({
          kind: "reminder",
          title,
          body,
          at: new Date().toISOString(),
          targetId: reminder.taskId,
        });
        void platform.notify({ title, body }).then((sent) => {
          if (!sent) latest.current.onFallback?.(`${title}: ${body}`);
        });
      }
    }

    // Once immediately, so a reminder that came due in the last few minutes
    // arrives on opening the app rather than up to half a minute later.
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
}

export { reminderKey };
