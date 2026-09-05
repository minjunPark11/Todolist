// Which tab the Settings screen opens on.
//
// It was `useState("account")` and nothing else, which is fine for someone who
// walked to Settings on purpose and wrong for the one case where the app sends
// them there on its own: the Google Calendar consent round trip lands on
// `/settings` (`googleSync/connectFlow.ts` — CALLBACK_LANDING_PATH), and the
// card that spends the code is drawn only while the Calendar tab is active.
// So the code arrived, nothing was mounted to read it, and the connection did
// not happen — until the user, with no reason to, clicked Calendar.
//
// Pure, and separate from the component, because the interesting part is a
// decision about two inputs and neither of them needs React to be checked.
import { parseCallback, type PendingConnect } from "../domain/calendar/googleSync/connectFlow";

export const SETTINGS_TABS = [
  "account",
  "appearance",
  "behavior",
  "notifications",
  "calendar",
  "focus",
  "data",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Where Settings opens when nothing is asking for anything in particular. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = "account";

export interface SettingsTabSignals {
  /** The whole address, callback fragment and all. `null` off the browser. */
  href: string | null;
  /**
   * A connect flow this client started and has not finished.
   *
   * The desktop road back is a deep link the Rust side holds until something
   * drains it, so there is no fragment to read — the pending nonce is the only
   * evidence on that platform that a round trip is in the air. Reading it is
   * safe on both: it is cleared when a callback resolves, and a stale one only
   * costs an opening tab.
   */
  pendingConnect: PendingConnect | null;
}

/**
 * The tab to open on, given what the address and the store say.
 *
 * Only one answer is not the default, and deliberately: a start-up tab that
 * guesses is worse than one that is predictable. This is not a guess — it is
 * the app finishing something it started.
 */
export function initialSettingsTab({ href, pendingConnect }: SettingsTabSignals): SettingsTab {
  if (parseCallback(href)) return "calendar";
  if (pendingConnect) return "calendar";
  return DEFAULT_SETTINGS_TAB;
}
