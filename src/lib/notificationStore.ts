// Where notifications are kept, and who is told when they change
// (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §3.1, F3).
//
// localStorage and not the account. A notification records what THIS DEVICE
// failed to put in front of the user: reminders fire from a foreground poll,
// so which ones were missed is already a per-device fact, and an entry read on
// the desktop showing up unread on the phone would be wrong in a way that a
// device-local list never is.
//
// Same shape as lib/calendarCategories.ts — one module-level value, a listener
// set, and `useSyncExternalStore` — because a React context for something two
// components read would thread a provider through the whole tree.
import { useSyncExternalStore } from "react";
import { platform } from "../platform";
import {
  addNotification,
  markAllRead,
  pruneNotifications,
  sanitizeNotifications,
  unreadCount,
  type AppNotification,
  type NotificationDraft,
} from "../domain/notifications/model";

const STORAGE_KEY = "focusflow.notifications.v1";

function createId(): string {
  return `ntf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function load(): AppNotification[] {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    // Pruned on the way in as well as on the way out: an app left closed for
    // two months should not open holding two months of stale notices.
    return pruneNotifications(sanitizeNotifications(raw ? JSON.parse(raw) : []));
  } catch {
    return [];
  }
}

let state: AppNotification[] = load();
const listeners = new Set<() => void>();

function setState(next: AppNotification[]) {
  if (next === state) return;
  state = next;
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode, or a full quota. The in-memory list still serves this
    // session; losing the history is better than refusing to record.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, () => state);
}

export function useUnreadNotificationCount(): number {
  return useSyncExternalStore(
    subscribe,
    // Recomputed per call rather than cached: the list is capped at 200, and
    // `useSyncExternalStore` compares the RESULT, so a number is a safe
    // snapshot where a derived array would loop.
    () => unreadCount(state),
  );
}

/**
 * Write one down (§3.2).
 *
 * Called from the places that already notify — it does not notify anything
 * itself. Deliberately not a hook: `useReminders` fires from inside a timer
 * callback, and the focus path from an effect, neither of which is a render.
 */
export function recordNotification(draft: NotificationDraft): void {
  const at = draft.at || new Date().toISOString();
  setState(
    addNotification(state, {
      id: createId(),
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      at,
      readAt: "",
      ...(draft.targetId ? { targetId: draft.targetId } : {}),
    }),
  );
}

/** Opening the panel is the read (§3.3). */
export function markNotificationsRead(): void {
  setState(markAllRead(state, new Date().toISOString()));
}

/** Test seam: nothing in the app clears the list. */
export function resetNotificationsForTest(next: AppNotification[] = []): void {
  state = next;
  listeners.forEach((listener) => listener());
}
