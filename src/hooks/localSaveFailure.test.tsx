// @vitest-environment jsdom
//
// The one save this app cannot do without. The account is optional; the local
// snapshot is where the user's work actually lives between launches, and it
// fails for real reasons — a full quota, a browser mode that refuses to store.
//
// Spec §9.45, §16.38 and §16.39 say what a failed save owes the user: keep
// what they typed, say so plainly, and retry against the newest state rather
// than the payload that failed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const store = new Map<string, string>();
let writesFail = false;
let writeCount = 0;

vi.mock("../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => {
        if (key === "focusflow.appData.v1") {
          writeCount += 1;
          if (writesFail) throw new Error("QuotaExceededError");
        }
        store.set(key, value);
      },
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

import { usePlannerData } from "./usePlannerData";

const snapshot = () => JSON.parse(store.get("focusflow.appData.v1") ?? "null");
const titles = () => (snapshot()?.tasks ?? []).map((task: { title: string }) => task.title);

beforeEach(() => {
  store.clear();
  writesFail = false;
  writeCount = 0;
  // The console.error the hook writes on failure is deliberate; it should not
  // make the test output look like something went wrong unexpectedly.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe("a local save that fails", () => {
  it("does not take the app down with it, and says so", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "Typed while the disk was full" });
    });

    expect(result.current.storageError).toBe(true);
  });

  // §9.45. The edit is accepted, on screen, and editable. Rolling the store
  // back to the last version that WAS written would lose the user's work in
  // order to hide the error.
  it("keeps what the user typed in memory", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "Still here" });
    });

    expect(result.current.tasks.map((task) => task.title)).toContain("Still here");
    expect(titles()).not.toContain("Still here");
  });

  // §16.39: the retry is not a replay. By the time it runs the user has
  // usually typed more, and writing the snapshot they had a minute ago would
  // undo everything since.
  it("retries against the latest state, not the payload that failed", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "First" });
    });
    act(() => {
      result.current.addTask({ title: "Second" });
    });

    writesFail = false;
    act(() => {
      result.current.retryLocalSave();
    });

    expect(titles()).toEqual(expect.arrayContaining(["First", "Second"]));
    expect(result.current.storageError).toBe(false);
  });

  it("retries on its own, so a user who is not watching still gets saved", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "Written eventually" });
    });
    expect(result.current.storageError).toBe(true);

    writesFail = false;
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(titles()).toContain("Written eventually");
    expect(result.current.storageError).toBe(false);
  });

  // A tight retry loop would spend the main thread re-serializing the whole
  // store into a write that keeps failing, which is the worst thing to do to a
  // device that just told you it is out of room.
  it("backs off instead of hammering a device that is out of room", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "Doomed" });
    });
    const afterFirstFailure = writeCount;

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // 5s, 10s, 20s, 40s — four retries in the first minute, not twelve.
    expect(writeCount - afterFirstFailure).toBeLessThanOrEqual(5);
    expect(writeCount - afterFirstFailure).toBeGreaterThan(0);
  });

  it("clears itself once a write gets through", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "During the outage" });
    });
    expect(result.current.storageError).toBe(true);

    writesFail = false;
    act(() => {
      result.current.addTask({ title: "After it" });
    });

    expect(result.current.storageError).toBe(false);
    expect(titles()).toEqual(expect.arrayContaining(["During the outage", "After it"]));
  });
});

describe("the Retry button", () => {
  it("keeps the automatic retry going when the manual one fails too", () => {
    const { result } = renderHook(() => usePlannerData());

    writesFail = true;
    act(() => {
      result.current.addTask({ title: "Persistent" });
    });
    act(() => {
      result.current.retryLocalSave();
    });

    // Pressing Retry and having it fail must not leave the only remaining
    // attempt behind a button the user has to keep pressing.
    writesFail = false;
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(titles()).toContain("Persistent");
    expect(result.current.storageError).toBe(false);
  });
});
