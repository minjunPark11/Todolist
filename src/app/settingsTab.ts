// General is the default. OAuth returns must mount the connection card.
import { parseCallback, type PendingConnect } from "../domain/calendar/googleSync/connectFlow";

export const SETTINGS_TABS = ["general", "notifications", "account", "connections", "data", "about"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Where Settings opens when nothing is asking for anything in particular. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = "general";

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
  if (parseCallback(href)) return "connections";
  if (pendingConnect) return "connections";
  return DEFAULT_SETTINGS_TAB;
}
