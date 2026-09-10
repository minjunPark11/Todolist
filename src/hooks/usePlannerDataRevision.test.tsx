// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePlannerData } from "./usePlannerData";
import { normalizeTask } from "../domain/plannerData/normalize";
import { taskRevisionStorageKey } from "../lib/taskRevisionStore";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(), from: vi.fn(), rpc: vi.fn(), notify: vi.fn(),
  user: { id: "user-1", email: "test@example.com" },
}));
vi.mock("../platform", () => ({ platform: { kind: "web", storage: {
  getSync: (key: string) => mocks.storage.get(key) ?? null,
  setSync: (key: string, value: string) => { mocks.storage.set(key, value); },
} } }));
vi.mock("../lib/notificationStore", () => ({ recordNotification: mocks.notify }));
vi.mock("../lib/taskRevisionOwnership", () => ({ acquireTaskRevisionOwnership: async () => vi.fn() }));
vi.mock("../lib/focusHost", () => ({ connectFocusHost: ({ ready }: { ready: () => void }) => {
  ready(); return { owned: true, close: vi.fn(), send: vi.fn() };
} }));
vi.mock("../services/supabaseClient", () => ({ isSupabaseConfigured: true, supabase: {
  from: mocks.from, rpc: mocks.rpc, auth: {
    getSession: async () => ({ data: { session: { user: mocks.user } } }),
    getUser: async () => ({ data: { user: mocks.user } }),
    onAuthStateChange: () => ({ data: { listener: null, subscription: { unsubscribe: vi.fn() } } }),
  },
} }));

let enabled = true;
let serverTask = normalizeTask({ id: "t", title: "Server", status: "open", listId: "list-inbox", createdAt: "2026-09-08", updatedAt: "2026-09-08" });
let revision = 1;
let taskWrites: unknown[];
beforeEach(() => {
  vi.clearAllMocks(); mocks.storage.clear(); enabled = true; revision = 1; taskWrites = [];
  serverTask = normalizeTask({ id: "t", title: "Server", status: "open", listId: "list-inbox", createdAt: "2026-09-08", updatedAt: "2026-09-08" });
  mocks.from.mockImplementation((table: string) => {
    const value = () => table === "tasks" ? [{ data: serverTask }] : table === "lists"
      ? [{ data: { id: "list-inbox", name: "Inbox", kind: "inbox", projectId: "", order: 0 } }] : [];
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: table === "google_task_sync_accounts" ? { enabled } : null, error: null })),
      upsert: vi.fn((rows: unknown) => { if (table === "tasks") taskWrites.push(rows); return Promise.resolve({ error: null }); }),
      delete: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: value(), error: null }).then(resolve),
    };
    return query;
  });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_task_revision_snapshot") return { data: { userId: mocks.user.id,
      rows: [{ id: "t", data: serverTask, revision }], tombstones: [] }, error: null };
    if (name === "write_task_revision") {
      if (args.p_expected_revision !== revision) return { error: { code: "40001", message: "TASK_REVISION_CONFLICT" } };
      serverTask = args.p_data as typeof serverTask; revision++;
      return { data: { id: "t", data: serverTask, revision }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps a merged remote date in the UI and in later local saves", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  serverTask = { ...serverTask, dueDate: "2026-09-12" }; revision++;
  act(() => result.current.updateTask("t", { title: "Local title" }));
  await waitFor(() => expect(serverTask.title).toBe("Local title"), { timeout: 5000 });
  expect(result.current.tasks[0]).toMatchObject({ title: "Local title", dueDate: "2026-09-12" });
  act(() => result.current.updateTask("t", { description: "Next edit" }));
  await waitFor(() => expect(serverTask.description).toBe("Next edit"), { timeout: 5000 });
  expect(serverTask.dueDate).toBe("2026-09-12");
  expect(result.current.taskSyncConflicts()).toEqual([]);
});

it("merges separate groups when adopting a Google snapshot", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  await act(async () => { await result.current.withGoogleTaskSync(async () => {
    result.current.updateTask("t", { title: "Typing" });
    await new Promise(resolve => setTimeout(resolve, 0));
    serverTask = { ...serverTask, dueDate: "2026-09-12" }; revision++;
  }); });
  expect(result.current.tasks[0]).toMatchObject({ title: "Typing", dueDate: "2026-09-12" });
  expect(result.current.taskSyncConflicts()).toEqual([]);
});

it("loads server revisions and routes edited tasks through the RPC without direct upsert", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  act(() => result.current.updateTask("t", { title: "Edited" }));
  await waitFor(() => expect(serverTask.title).toBe("Edited"), { timeout: 3000 });
  expect(taskWrites).toEqual([]);
  const write = mocks.rpc.mock.calls.find(([name]) => name === "write_task_revision")!;
  expect(write[1]).toMatchObject({ p_task_id: "t", p_expected_revision: 1, p_expected_user_id: "user-1" });
  expect(write[1].p_write_id).toBeTypeOf("string");
  expect(result.current.tasks[0]).not.toHaveProperty("revision");
});

it("keeps the local draft visible and durably records both versions on conflict", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  serverTask = { ...serverTask, title: "Other device" }; revision = 2;
  act(() => result.current.updateTask("t", { title: "Local draft" }));
  await waitFor(() => expect(result.current.auth.syncError).toContain("conflict"), { timeout: 3000 });
  expect(result.current.tasks[0].title).toBe("Local draft");
  expect(serverTask.title).toBe("Other device");
  expect(taskWrites).toEqual([]);
  const checkpoint = JSON.parse(mocks.storage.get(taskRevisionStorageKey("user-1"))!);
  expect(checkpoint.conflicts.t).toMatchObject({ local: { title: "Local draft" }, remote: { data: { title: "Other device" } } });
});

it("retains legacy task writes for accounts not enabled for revision sync", async () => {
  enabled = false;
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  act(() => result.current.updateTask("t", { title: "Legacy edit" }));
  await waitFor(() => expect(taskWrites.length).toBeGreaterThan(0), { timeout: 3000 });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("restores a durable pending edit after remount without silently adopting a newer server revision", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const first = renderHook(() => usePlannerData());
  await waitFor(() => expect(first.result.current.auth.remoteDataReady).toBe(true));
  act(() => first.result.current.updateTask("t", { title: "Offline draft" }));
  first.unmount(); // Before the 700ms debounce; local outbox already holds the edit.
  serverTask = { ...serverTask, title: "Server changed" }; revision = 2;
  const second = renderHook(() => usePlannerData());
  await waitFor(() => expect(second.result.current.auth.remoteDataReady).toBe(true));
  expect(second.result.current.tasks[0].title).toBe("Offline draft");
  expect(second.result.current.auth.syncError).toContain("conflict");
  expect(serverTask.title).toBe("Server changed");
});

it("adopts Google changes through revisions without echoing them as direct writes", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  expect(result.current.auth.taskSyncMode).toBe("revision");
  await act(async () => { await result.current.withGoogleTaskSync(async userId => {
    expect(userId).toBe("user-1"); serverTask = { ...serverTask, title: "From Google" }; revision++;
  }); });
  expect(result.current.tasks[0].title).toBe("From Google"); expect(taskWrites).toEqual([]);
});
it("preserves an edit made during Google I/O as an explicit resolvable conflict", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  await act(async () => { await result.current.withGoogleTaskSync(async () => {
    result.current.updateTask("t", { title: "Typing" });
    await new Promise(resolve => setTimeout(resolve, 0));
    serverTask = { ...serverTask, title: "From Google" }; revision++;
  }); });
  expect(result.current.tasks[0].title).toBe("Typing");
  const conflict = result.current.taskSyncConflicts()[0];
  expect(conflict.remote?.data.title).toBe("From Google");
  await act(async () => { await result.current.resolveTaskSyncConflict("t", "remote", conflict); });
  expect(result.current.tasks[0].title).toBe("From Google"); expect(result.current.taskSyncConflicts()).toHaveLength(0);
});
it("moves unsent content to trash when Google cancels, retaining the edited title", async () => {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  await act(async () => { await result.current.withGoogleTaskSync(async () => {
    result.current.updateTask("t", { title: "Unsent title" });
    await new Promise(resolve => setTimeout(resolve, 0));
    serverTask = { ...serverTask, deletedAt: "2026-09-09" }; revision++;
  }); });
  expect(result.current.tasks[0]).toMatchObject({ title: "Unsent title", deletedAt: "2026-09-09" });
  expect(result.current.taskSyncConflicts()).toHaveLength(0);
});

it("keeps letting Google sync run while a conflict waits on a person, and names it", async () => {
  // Four device conflicts used to close this bridge outright, which froze the
  // whole Google cycle: reviews could not be answered and the sync time zone
  // could not be re-pinned, for as long as nobody noticed the four. A conflict
  // waits on a person; nothing else should wait behind it.
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));

  // Make one, exactly the way the previous test does.
  await act(async () => { await result.current.withGoogleTaskSync(async () => {
    result.current.updateTask("t", { title: "Typing" });
    await new Promise(resolve => setTimeout(resolve, 0));
    serverTask = { ...serverTask, title: "From Google" }; revision++;
  }); });
  expect(result.current.taskSyncConflicts()).toHaveLength(1);

  // The next pass runs anyway, and hands the contested id to the cycle so it
  // can leave that one task alone.
  let ran = false, named: string[] = [];
  await act(async () => { await result.current.withGoogleTaskSync(async (_userId, blockedTaskIds) => {
    ran = true; named = blockedTaskIds;
  }); });
  expect(ran).toBe(true);
  expect(named).toEqual(["t"]);
  // And the question is still open — running past it is not answering it.
  expect(result.current.taskSyncConflicts()).toHaveLength(1);
});
