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

/**
 * 옆 탭이 적은 것을 이 탭도 본다.
 *
 * 이 목록은 **장치의** 목록이지 탭의 목록이 아니다 (§3.1). 그런데 `state` 는
 * 모듈이 처음 실행될 때 한 번 읽고 그 뒤로는 저장소를 다시 보지 않았고,
 * 쓸 때는 자기 메모리 목록을 **통째로** 썼다. 그래서 한 탭이 적은 줄을 다른
 * 탭의 다음 쓰기가 지웠다 — 재보니 옆 탭이 적어둔 줄이 이 탭의 리마인더
 * 하나에 통째로 덮여 사라졌다 [실측].
 *
 * `storage` 이벤트는 다른 문서의 쓰기에서만 오므로, 이것이 곧 "옆 탭이
 * 무언가 적었다"는 신호다.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    const next = load();
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    listeners.forEach((listener) => listener());
  });
}

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
  // 저장소에서 다시 읽은 것 위에 더한다. `storage` 이벤트가 이 탭에 닿기
  // 전에 적는 경우(같은 틱에 두 탭이 적는 경우)가 남아 있고, 그때 메모리
  // 목록을 그대로 쓰면 옆 탭의 줄이 사라진다.
  setState(
    addNotification(load(), {
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
  // 같은 이유로 여기서도 다시 읽는다 — 읽음 표시는 목록 전체를 다시 쓰므로,
  // 오래된 목록 위에 표시하면 그 사이에 들어온 줄을 지운다.
  setState(markAllRead(load(), new Date().toISOString()));
}

/** Test seam: nothing in the app clears the list. */
export function resetNotificationsForTest(next: AppNotification[] = []): void {
  state = next;
  listeners.forEach((listener) => listener());
}
