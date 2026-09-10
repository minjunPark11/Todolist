import { expect, it, vi } from "vitest";
import { normalizeTask } from "../plannerData/normalize";
import { mergeTaskRevisions } from "../tasks/mergeTaskRevisions";
import { createTaskRevisionSession, TaskRevisionBlocked, type RevisionCheckpoint, type RevisionWrite } from "./taskRevisionSession";
import type { Task } from "../../types";

const base = normalizeTask({ id: "t", title: "Meeting", dueDate: "2026-09-10" });
const conflict = () => Object.assign(new Error("conflict"), { code: "40001" });
function fixture() {
  let row = { id: "t", revision: 1, data: base };
  let tombstones: string[] = [];
  let saved: RevisionCheckpoint<Task>;
  let serial = 0;
  const merge = vi.fn((ancestor: Task, local: Task, remote: Task) => {
    const result = mergeTaskRevisions(ancestor, local, remote, "2026-09-10T12:00:00Z");
    return result.ok ? result.task : null;
  });
  const write = vi.fn(async (request: RevisionWrite<Task>) => {
    if (request.expectedRevision !== row.revision) throw conflict();
    row = { id: "t", revision: row.revision + 1, data: request.data! };
    return row;
  });
  const deps = {
    read: async () => ({ userId: "u", rows: tombstones.length ? [] : [row], tombstones }),
    write, merge, active: () => true, id: () => `w${++serial}`,
    persist: (state: RevisionCheckpoint<Task>) => { saved = structuredClone(state); },
  };
  const session = createTaskRevisionSession("u", deps);
  return { session, deps, merge, write, get saved() { return saved!; }, get row() { return row; },
    remote: (data: Partial<Task>) => { row = { ...row, revision: row.revision + 1, data: { ...row.data, ...data } }; },
    remove: () => { tombstones = ["t"]; } };
}

it.each(["refresh", "flush"])("merges separate groups during %s and writes against the new revision", async path => {
  const f = fixture(); await f.session.refresh();
  f.session.capture([{ ...base, title: "Team meeting" }]);
  f.remote({ dueDate: "2026-09-12" });
  if (path === "refresh") await f.session.refresh();
  await f.session.flush();
  expect(f.row.data).toMatchObject({ title: "Team meeting", dueDate: "2026-09-12" });
  expect(f.row.revision).toBe(3);
  expect(f.session.hasPending).toBe(false);
  expect(f.write.mock.calls[f.write.mock.calls.length - 1][0]).toMatchObject({ expectedRevision: 2 });
  expect(f.write.mock.calls[f.write.mock.calls.length - 1][0]).not.toHaveProperty("base");
  expect(f.session.takeAutoMergedCount()).toBe(1);
  expect(f.session.takeAutoMergedCount()).toBe(0);
});

it("stops after two merge retries while another device keeps editing", async () => {
  const f = fixture(); await f.session.refresh(); f.session.capture([{ ...base, title: "Local" }]);
  let attempt = 0;
  f.write.mockImplementation(async () => { f.remote({ dueDate: `2026-09-${12 + attempt++}` }); throw conflict(); });
  await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
  expect(f.write).toHaveBeenCalledTimes(3);
  expect(f.merge).toHaveBeenCalledTimes(2);
  expect(f.saved.conflicts.t.local?.title).toBe("Local");
  // A task still awaiting a decision is not an automatically resolved task.
  expect(f.session.takeAutoMergedCount()).toBe(0);
});

it("does not automatically dismiss an existing question even when the two versions become equal", async () => {
  const f = fixture(); await f.session.refresh(); f.session.capture([{ ...base, title: "Local" }]);
  f.remote({ title: "Remote" }); await f.session.refresh();
  f.session.capture([f.row.data]);
  await f.session.refresh();
  expect(f.session.hasConflicts).toBe(true);
  expect(f.merge).toHaveBeenCalledTimes(1);
  expect(f.session.takeAutoMergedCount()).toBe(0);
});

it("keeps old checkpoints without a base as conflicts", async () => {
  const f = fixture(); await f.session.refresh(); f.session.capture([{ ...base, title: "Local" }]);
  const checkpoint = f.saved; delete checkpoint.pending.t.base;
  f.remote({ dueDate: "2026-09-12" });
  const restored = createTaskRevisionSession("u", f.deps, checkpoint);
  await restored.refresh(); expect(restored.hasConflicts).toBe(true);
  expect(f.merge).not.toHaveBeenCalled();
});

it.each(["local", "remote"])("does not merge a %s deletion", async side => {
  const f = fixture(); await f.session.refresh();
  f.session.capture(side === "local" ? [] : [{ ...base, title: "Local" }]);
  if (side === "remote") f.remove(); else f.remote({ title: "Remote" });
  await f.session.refresh(); expect(f.session.hasConflicts).toBe(true);
  expect(f.merge).not.toHaveBeenCalled();
});

it("retries a lost response with the same merged write receipt", async () => {
  const f = fixture(); await f.session.refresh(); f.session.capture([{ ...base, title: "Local" }]);
  f.remote({ dueDate: "2026-09-12" });
  f.write.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(new Error("response lost"));
  await expect(f.session.flush()).rejects.toThrow("response lost");
  const pendingReceipt = f.saved.inflight.t;
  await f.session.flush();
  expect(f.write.mock.calls[f.write.mock.calls.length - 1][0]).toEqual(pendingReceipt);
  expect(f.merge).toHaveBeenCalledTimes(1);
});
