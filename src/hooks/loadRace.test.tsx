// @vitest-environment jsdom
//
// What happens to work in progress when the account's answer arrives.
//
// The load replaces the whole store, and two things used to go missing when it
// did: an edit made while it was in flight (§24.24), and — after it landed —
// the meaning of every queued undo entry, each of which holds a snapshot of a
// store that no longer exists (§16.21).
//
// Both are silent, and both end at the account rather than on the device: the
// save that follows a load diffs against what loaded, so a record that vanished
// locally reads as a record the user deleted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { popUndo } from "../lib/undoStack";

const store = new Map<string, string>();
vi.mock("../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => void store.set(key, value),
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

/** Rows the fake account holds, by table. */
const remoteRows = new Map<string, unknown[]>();
/** Resolved when the load has asked for its first table, so a test can edit
 *  while the fetch is genuinely in flight. */
let loadReachedNetwork: (() => void) | null = null;
/** Held open until a test releases it, which is how "in flight" is staged. */
let releaseLoad: Promise<void> = Promise.resolve();

function selectResult(table: string) {
  return { data: (remoteRows.get(table) ?? []).map((row) => ({ data: row })), error: null };
}

vi.mock("../services/supabaseClient", () => {
  const from = (table: string) => ({
    select: () => {
      loadReachedNetwork?.();
      loadReachedNetwork = null;
      const settled = releaseLoad.then(() => selectResult(table));
      return {
        then: (resolve: (value: unknown) => unknown) => settled.then(resolve),
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      };
    },
    upsert: async () => ({ error: null }),
    delete: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }),
  });
  return {
    isSupabaseConfigured: true,
    supabase: {
      from,
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getUser: async () => ({ data: { user: null } }),
      },
    },
  };
});

import { usePlannerData } from "./usePlannerData";
import { specFromOffer, TIMED_OFFERS } from "../domain/schedule";
import type { Task } from "../types";

function remoteTask(id: string, title: string): Partial<Task> {
  return {
    id,
    title,
    status: "todo",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
  };
}

beforeEach(() => {
  store.clear();
  remoteRows.clear();
  releaseLoad = Promise.resolve();
  loadReachedNetwork = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  while (popUndo());
  vi.restoreAllMocks();
  cleanup();
});

const titles = (tasks: Task[]) => tasks.map((task) => task.title).sort();

describe("an edit made while the account is loading", () => {
  it("is still there when the load lands", async () => {
    remoteRows.set("tasks", [remoteTask("remote-1", "From the account")]);
    const { result } = renderHook(() => usePlannerData());

    // Stage the load so it is genuinely mid-flight when the user types.
    let release = () => {};
    releaseLoad = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reachedNetwork = new Promise<void>((resolve) => {
      loadReachedNetwork = resolve;
    });

    let loading!: Promise<void>;
    act(() => {
      loading = result.current.refreshSupabaseData();
    });
    await reachedNetwork;

    act(() => {
      result.current.addTask({ title: "Typed while loading" });
    });

    await act(async () => {
      release();
      await loading;
    });

    expect(titles(result.current.tasks)).toEqual(["From the account", "Typed while loading"]);
  });

  it("leaves the account's own records alone", async () => {
    remoteRows.set("tasks", [remoteTask("a", "One"), remoteTask("b", "Two")]);
    const { result } = renderHook(() => usePlannerData());

    await act(async () => {
      await result.current.refreshSupabaseData();
    });

    expect(titles(result.current.tasks)).toEqual(["One", "Two"]);
  });
});

describe("a table the account has only just been given", () => {
  // The window this covers: `reminders` and `task_templates` shipped with
  // v0.19.0 and are optional client-side, so until the migration runs the load
  // keeps them on the device. The moment the table exists and is empty, taking
  // its answer literally would wipe them — and the local snapshot is written
  // back straight after, so they would be gone from the device as well.
  it("keeps the records this device already had", async () => {
    const { result } = renderHook(() => usePlannerData());
    const taskId = await act(async () => result.current.createTask({ title: "Ship it" }));

    act(() => {
      result.current.updateTaskSchedule(taskId, {
        startDate: null,
        dueDate: "2026-09-01",
        startTime: "15:00",
        endTime: null,
        timezone: null,
        reminders: [specFromOffer(TIMED_OFFERS[2])],
        repeat: "none",
      });
    });
    expect(result.current.reminders).toHaveLength(1);

    // The table now exists and holds nothing, which is exactly what a
    // freshly applied migration looks like.
    remoteRows.set("reminders", []);
    await act(async () => {
      await result.current.refreshSupabaseData();
    });

    expect(result.current.reminders).toHaveLength(1);
  });

  it("still takes the account's answer once the table holds anything", async () => {
    const { result } = renderHook(() => usePlannerData());
    const taskId = await act(async () => result.current.createTask({ title: "Ship it" }));

    act(() => {
      result.current.updateTaskSchedule(taskId, {
        startDate: null,
        dueDate: "2026-09-01",
        startTime: "15:00",
        endTime: null,
        timezone: null,
        reminders: [specFromOffer(TIMED_OFFERS[2])],
        repeat: "none",
      });
    });

    // One row on the account is enough: the fallback is for a collection that
    // has never synced, not for one this device happens to disagree with.
    remoteRows.set("reminders", [
      {
        id: "reminder-remote",
        taskId,
        type: "relative",
        offsetMinutes: 10,
        absoluteAt: null,
        allDayTime: null,
        enabled: true,
        createdAt: "2026-08-01T09:00:00.000Z",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
    ]);
    await act(async () => {
      await result.current.refreshSupabaseData();
    });

    expect(result.current.reminders.map((row) => row.id)).toEqual(["reminder-remote"]);
  });

  it("leaves a required table's empty answer alone", async () => {
    // `tasks` is not optional. An account with no tasks means no tasks, and
    // treating that as "never synced" would resurrect everything a user had
    // deliberately cleared.
    const { result } = renderHook(() => usePlannerData());
    await act(async () => result.current.createTask({ title: "Local only" }));

    remoteRows.set("tasks", []);
    await act(async () => {
      await result.current.refreshSupabaseData();
    });

    expect(result.current.tasks).toEqual([]);
  });
});

// The undo half. An entry pushed before the load holds the store as it was
// WITHOUT the account's records; running it after the load would take them off
// the device, and the next save would then take them off the account.
describe("Ctrl+Z after a load has landed", () => {
  it("does not restore a store the load has replaced", async () => {
    remoteRows.set("tasks", [remoteTask("remote-1", "From the account")]);
    const { result } = renderHook(() => usePlannerData());

    act(() => {
      result.current.addTask({ title: "Before the load" });
    });

    await act(async () => {
      await result.current.refreshSupabaseData();
    });

    // The entry declines, so Ctrl+Z reports that nothing was undone rather
    // than showing "Undone" over a store it just emptied.
    let undone = true;
    act(() => {
      undone = popUndo();
    });

    expect(undone).toBe(false);
    expect(result.current.tasks.map((task) => task.title)).toContain("From the account");
  });

  it("still undoes an edit made after the load", async () => {
    remoteRows.set("tasks", [remoteTask("remote-1", "From the account")]);
    const { result } = renderHook(() => usePlannerData());

    await act(async () => {
      await result.current.refreshSupabaseData();
    });
    act(() => {
      result.current.addTask({ title: "After the load" });
    });

    act(() => {
      popUndo();
    });

    expect(titles(result.current.tasks)).toEqual(["From the account"]);
  });
});
