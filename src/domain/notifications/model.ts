// What the app has told the user, kept
// (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §3).
//
// Everything this app notifies about used to vanish at the moment it was
// said: a reminder went to the OS, a focus session's end went to the OS, an
// update was a banner, a sync failure was one sentence on the Settings page.
// So there was nothing a bell could open.
//
// That matters most for reminders. `useReminders` is a foreground poll — it
// says so itself — which means a reminder only fires while the app is running.
// Anything due while it was closed was never delivered anywhere and left no
// trace. This file is what makes "what did I miss" answerable.
//
// Pure, so the cap and the read rules can be tested without a browser; the
// localStorage half lives in lib/notificationStore.ts.

export type NotificationKind =
  | "reminder"
  | "focusCompleted"
  | "syncFailed"
  | "calendarFailed"
  | "updateAvailable";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO. When the thing happened, not when it was written down. */
  at: string;
  /** ISO, or "" while unread. */
  readAt: string;
  /** What to open — a task id for a reminder, "" for the rest. */
  targetId?: string;
}

/** What a caller hands in; the store fills the rest. */
export type NotificationDraft = Pick<AppNotification, "kind" | "title" | "body"> &
  Partial<Pick<AppNotification, "at" | "targetId">>;

/**
 * The two limits, and why there are two (F6).
 *
 * A count alone lets a quiet account keep notices from a year ago, which are
 * not "what did I miss" by then. An age alone lets a noisy day fill the store
 * without bound. Whichever bites first wins.
 */
export const MAX_NOTIFICATIONS = 200;
export const MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function timeOf(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Newest first, which is the only order this list is ever read in. */
export function sortNotifications(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => timeOf(b.at) - timeOf(a.at));
}

/**
 * Drops what is past either limit.
 *
 * An entry with an unreadable `at` sorts to the end and is aged out on the
 * first prune — a record we cannot place in time is not one we can promise
 * anything about.
 */
export function pruneNotifications(
  list: AppNotification[],
  nowMs = Date.now(),
): AppNotification[] {
  const oldest = nowMs - MAX_AGE_DAYS * DAY_MS;
  return sortNotifications(list)
    .filter((entry) => timeOf(entry.at) >= oldest)
    .slice(0, MAX_NOTIFICATIONS);
}

export function unreadCount(list: AppNotification[]): number {
  return list.reduce((count, entry) => (entry.readAt ? count : count + 1), 0);
}

/**
 * Everything read at once (§3.3).
 *
 * Opening the panel is the read: this list is skimmed, not managed, and a
 * per-entry read state would add a control to every row to answer a question
 * nobody asked. Returns the same array when nothing changed, so a store built
 * on identity does not notify for a no-op.
 */
export function markAllRead(list: AppNotification[], now: string): AppNotification[] {
  if (list.every((entry) => entry.readAt)) return list;
  return list.map((entry) => (entry.readAt ? entry : { ...entry, readAt: now }));
}

/** Adds one and applies the cap in the same step. */
export function addNotification(
  list: AppNotification[],
  entry: AppNotification,
  nowMs = Date.now(),
): AppNotification[] {
  return pruneNotifications([entry, ...list], nowMs);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const KINDS: NotificationKind[] = [
  "reminder",
  "focusCompleted",
  "syncFailed",
  "calendarFailed",
  "updateAvailable",
];

/**
 * A stored record made usable.
 *
 * An entry missing an id, a kind this build does not know, or no timestamp is
 * dropped rather than repaired: unlike a List colour, there is nothing here
 * worth carrying forward for a future client — a notification that cannot be
 * placed or named is not a notification.
 */
export function sanitizeNotifications(value: unknown): AppNotification[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: AppNotification[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = asString(record.id);
    const kind = asString(record.kind) as NotificationKind;
    const at = asString(record.at);
    if (!id || seen.has(id) || !KINDS.includes(kind) || !at || timeOf(at) === 0) continue;
    seen.add(id);
    const targetId = asString(record.targetId);
    entries.push({
      id,
      kind,
      title: asString(record.title),
      body: asString(record.body),
      at,
      readAt: asString(record.readAt),
      ...(targetId ? { targetId } : {}),
    });
  }
  return sortNotifications(entries);
}
