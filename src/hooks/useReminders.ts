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

/**
 * 쓸기를 한 번에 한 탭만 하도록 묶는 자물쇠.
 *
 * 울린 기록(`STORAGE_KEY`)은 저장소에 있지만 각 탭은 그것을 **뜰 때 한 번**
 * 읽어 메모리에 들고 있었다. 탭 둘이 이미 열려 있는 채로 시각이 도래하면
 * 둘 다 자기 집합에서 그 열쇠를 못 찾고 둘 다 울린다 — 재보니 한 리마인더에
 * OS 알림이 정확히 두 번 떴다 [실측: 탭별 [1,1]].
 *
 * 그래서 두 가지가 같이 필요하다. 쓸기를 시작할 때 저장소를 **다시 읽고**,
 * 읽고-보고-쓰는 그 구간을 자물쇠로 묶는다. 다시 읽기만 하면 두 탭의 tick 이
 * 같은 순간에 겹칠 때 여전히 둘 다 울릴 수 있다.
 *
 * `navigator.locks` 는 이 앱이 이미 쓰는 장치다 — `lib/focusHost.ts` 가
 * 같은 것으로 "타이머를 쓰는 탭은 하나"를 정한다. 없는 환경(보안 컨텍스트가
 * 아닌 곳)에서는 그냥 돈다: 그때의 최악은 예전과 같고, 더 나쁘지 않다.
 */
const SWEEP_LOCK = "focusflow.reminders.sweep.v1";

function withSweepLock(run: () => void): void {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) {
    run();
    return;
  }
  // 대기하는 쪽을 고른다(`ifAvailable` 이 아니라). 자물쇠를 못 얻어 이번
  // 차례를 건너뛰면 그 리마인더는 30 초를 늦게 도착한다 — 줄을 서면 앞
  // 사람이 기록을 남긴 뒤에 들어가므로, 우리가 할 일은 "이미 울렸다"를
  // 읽고 조용히 물러나는 것뿐이다. 콜백은 동기이고 짧아서 줄이 길어지지
  // 않는다.
  void locks.request(SWEEP_LOCK, () => {
    run();
  });
}

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
    let stopped = false;

    function sweep() {
      const seen = seenRef.current;
      if (seen === null || stopped) return;

      // 매번 저장소에서 다시 읽어 합친다. 이 집합은 이 탭이 뜬 순간의
      // 사진이고, 그 뒤에 옆 탭이 울린 것은 거기 없다.
      for (const key of readSeen()) seen.add(key);

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

    const tick = () => withSweepLock(sweep);

    // Once immediately, so a reminder that came due in the last few minutes
    // arrives on opening the app rather than up to half a minute later.
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      // 자물쇠를 기다리던 차례가 언마운트 뒤에 들어올 수 있다. 그때 울리면
      // 화면에 없는 앱이 알림을 내는 것이 된다.
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
}

export { reminderKey };
