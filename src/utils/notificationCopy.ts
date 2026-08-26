// What the settings screen says about each of the four notification answers.
//
// SETTINGS_REVIEW.md 4.1. `notificationAccess` has four values on purpose
// (§26.6.2): "never asked", "refused", "no channel on this platform" and
// "allowed" are different facts and a screen that collapses them tells the user
// the wrong thing. This is the mapping, kept out of the component because the
// browser cannot be put into three of the four states — headless Chromium
// reports `denied` and stays there — so the only way to check every branch is
// to call it.
import type { NotificationAccess } from "../platform/types";

/** The line under "Notification permission". */
export function notificationHintKey(access: NotificationAccess): string {
  switch (access) {
    case "granted":
      return "settings.notif.granted";
    case "denied":
      return "settings.notif.denied";
    case "unsupported":
      return "settings.notif.unsupported";
    default:
      return "settings.notif.unasked";
  }
}

/**
 * Whether to offer the button at all.
 *
 * Only `unasked`. A second request after a refusal is a no-op in every browser
 * — `useNotificationAccess` says so where it drops the call — so a button that
 * appeared for `denied` would do nothing and teach the user that the app is
 * broken rather than that the permission is elsewhere. The `denied` copy sends
 * them to the browser or the OS instead.
 */
export function canAskForNotifications(access: NotificationAccess): boolean {
  return access === "unasked";
}

/** Whether a test notification has any chance of arriving. */
export function canSendTestNotification(access: NotificationAccess): boolean {
  return access === "granted";
}
