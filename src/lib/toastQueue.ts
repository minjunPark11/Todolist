// Toast queue state (USABILITY_IMPROVEMENT_DESIGN.md §8).
//
// The app used to hold a single toast, so two actions in a row replaced the
// first toast before its undo button could be pressed. Toasts are now a short
// queue: each one lives out its own lifetime, and only the oldest is dropped
// when more than LIMIT pile up.

export interface QueuedToast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const TOAST_LIMIT = 3;
export const TOAST_LIFETIME_MS = 4500;
/** Toasts with an action stay longer — 4.5s is not enough to read and decide. */
export const TOAST_ACTION_LIFETIME_MS = 7000;

export function toastLifetime(toast: Pick<QueuedToast, "onAction">): number {
  return toast.onAction ? TOAST_ACTION_LIFETIME_MS : TOAST_LIFETIME_MS;
}

/** Appends a toast, dropping the oldest ones once the queue is over LIMIT. */
export function enqueueToast(queue: QueuedToast[], toast: QueuedToast): QueuedToast[] {
  return [...queue, toast].slice(-TOAST_LIMIT);
}

export function dismissToast(queue: QueuedToast[], id: number): QueuedToast[] {
  const next = queue.filter((toast) => toast.id !== id);
  return next.length === queue.length ? queue : next;
}
