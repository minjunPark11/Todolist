import { describe, expect, it, vi } from "vitest";
import {
  dismissToast,
  enqueueToast,
  toastLifetime,
  TOAST_ACTION_LIFETIME_MS,
  TOAST_LIFETIME_MS,
  TOAST_LIMIT,
  type QueuedToast,
} from "./toastQueue";

function toast(id: number, withAction = false): QueuedToast {
  return withAction
    ? { id, message: `m${id}`, actionLabel: "Undo", onAction: vi.fn() }
    : { id, message: `m${id}` };
}

describe("enqueueToast", () => {
  it("keeps toasts in arrival order", () => {
    const queue = [toast(1), toast(2)].reduce(enqueueToast, [] as QueuedToast[]);
    expect(queue.map((item) => item.id)).toEqual([1, 2]);
  });

  it("drops the oldest once past the limit instead of replacing the newest", () => {
    let queue: QueuedToast[] = [];
    for (let id = 1; id <= TOAST_LIMIT + 2; id += 1) {
      queue = enqueueToast(queue, toast(id));
    }
    expect(queue).toHaveLength(TOAST_LIMIT);
    // The two oldest fell off; the newest survived.
    expect(queue.map((item) => item.id)).toEqual([3, 4, 5]);
  });

  it("does not mutate the queue it was given", () => {
    const original = [toast(1)];
    const next = enqueueToast(original, toast(2));
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe("dismissToast", () => {
  it("removes only the matching toast", () => {
    const queue = [toast(1), toast(2), toast(3)];
    expect(dismissToast(queue, 2).map((item) => item.id)).toEqual([1, 3]);
  });

  it("returns the same reference when nothing matches, so React can skip a render", () => {
    const queue = [toast(1)];
    expect(dismissToast(queue, 99)).toBe(queue);
  });
});

describe("toastLifetime", () => {
  it("gives actionable toasts longer to be read and pressed", () => {
    expect(toastLifetime(toast(1))).toBe(TOAST_LIFETIME_MS);
    expect(toastLifetime(toast(2, true))).toBe(TOAST_ACTION_LIFETIME_MS);
    expect(TOAST_ACTION_LIFETIME_MS).toBeGreaterThan(TOAST_LIFETIME_MS);
  });
});
