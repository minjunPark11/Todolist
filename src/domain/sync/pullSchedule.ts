// When to read the account again (MULTI_DEVICE_SYNC_DESIGN.md §3).
//
// Syncing was automatic in one direction only: edits went up 700ms after they
// settled, and the account came down exactly once, at sign-in. Leave the app
// open on the desktop, change something on the web, and the desktop simply did
// not know — for as long as it stayed open.
//
// Three triggers now, and they answer three different failure modes, so all
// three earn their place:
//
//   realtime  — another device wrote. Seconds, and the reason this feels live.
//   focus     — this window came back. Catches whatever realtime dropped while
//               the socket was down, at the moment a person is about to look.
//   periodic  — the floor. Realtime can fail silently; a window left open for
//               an afternoon must not go stale.
//
// Pure, because the interesting part is the three rules that keep them from
// turning into a request storm, and those are worth reading in one place.
export type PullTrigger = "realtime" | "focus" | "periodic";

/**
 * How long after our own save a realtime event is assumed to be our own echo.
 *
 * Our writes come back to us as events like anyone else's. Acting on them is
 * harmless — the data is already what we hold — but it is a round trip per
 * keystroke-shaped edit. Generous on purpose: a missed pull costs at most one
 * `focus` or `periodic` tick, and a stingy window costs a request every time.
 */
export const ECHO_WINDOW_MS = 2_000;

/** A person moving between windows must not spend a request per switch. */
export const FOCUS_COOLDOWN_MS = 10_000;

/** The floor, for a window nobody touches and a socket nobody notices died. */
export const PERIODIC_MS = 5 * 60_000;

export interface PullClock {
  now: number;
  /** When the last pull STARTED. 0 if none this session. */
  lastPullAt: number;
  /** When our own last save finished. 0 if none this session. */
  lastSaveAt: number;
}

/**
 * Whether this trigger should reach the account.
 *
 * `periodic` is never suppressed: it is the one trigger whose whole job is to
 * be the thing that still runs when the other two have quietly stopped
 * working. Its caller decides not to fire it while the window is hidden, which
 * is a different question — whether anyone is there to see the answer.
 */
export function shouldPull(trigger: PullTrigger, clock: PullClock): boolean {
  if (trigger === "realtime") return clock.now - clock.lastSaveAt >= ECHO_WINDOW_MS;
  if (trigger === "focus") return clock.now - clock.lastPullAt >= FOCUS_COOLDOWN_MS;
  return true;
}
