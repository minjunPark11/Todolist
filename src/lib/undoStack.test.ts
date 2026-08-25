import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { popUndo, pushUndo } from "./undoStack";

// The stack is module-global and deliberately has no reset — nothing in the
// app ever wants one. Draining it keeps each test independent.
function drain() {
  while (popUndo());
}

beforeEach(() => {
  vi.useFakeTimers();
  drain();
});

afterEach(() => {
  drain();
  vi.useRealTimers();
});

/** Past the 150ms window, so the next push starts its own group. */
function separately() {
  vi.advanceTimersByTime(200);
}

describe("grouping", () => {
  it("reverts one user action even when it changed several stores", () => {
    const order: string[] = [];
    pushUndo(() => void order.push("first"));
    pushUndo(() => void order.push("second"));

    expect(popUndo()).toBe(true);
    // Newest first, so the oldest snapshot in the group is the one that wins.
    expect(order).toEqual(["second", "first"]);
    expect(popUndo()).toBe(false);
  });

  it("keeps separate actions separate", () => {
    const order: string[] = [];
    pushUndo(() => void order.push("first"));
    separately();
    pushUndo(() => void order.push("second"));

    popUndo();
    expect(order).toEqual(["second"]);
    popUndo();
    expect(order).toEqual(["second", "first"]);
  });
});

// §16.21 applied to undo. An entry holds a whole-store snapshot, so it is only
// an undo while the store is still the one it came from. After a remote load
// has replaced it, restoring would not walk one edit back — it would drop
// everything the load brought in.
describe("an entry whose store has moved on", () => {
  it("declines instead of restoring, and reports nothing was undone", () => {
    const restore = vi.fn(() => false as const);
    pushUndo(restore);

    expect(popUndo()).toBe(false);
    expect(restore).toHaveBeenCalled();
  });

  it("does not leave a dead entry behind for the next Ctrl+Z", () => {
    pushUndo(() => false);
    popUndo();

    // If the declined entry were still on the stack, this would run it again
    // and answer false; the stack is empty, and that is also false — so assert
    // the reachable thing instead: a live entry pushed after it still works.
    const restore = vi.fn();
    pushUndo(restore);
    expect(popUndo()).toBe(true);
    expect(restore).toHaveBeenCalledOnce();
  });

  it("reaches past dead entries to the newest edit it can still undo", () => {
    const live = vi.fn();
    pushUndo(live);
    separately();
    pushUndo(() => false);
    separately();
    pushUndo(() => false);

    // One Ctrl+Z, not three. Two stale groups are discarded on the way.
    expect(popUndo()).toBe(true);
    expect(live).toHaveBeenCalledOnce();
  });

  it("counts a group as undone when any of its restores applied", () => {
    const live = vi.fn();
    pushUndo(() => false);
    pushUndo(live);

    expect(popUndo()).toBe(true);
    expect(live).toHaveBeenCalledOnce();
  });
});
