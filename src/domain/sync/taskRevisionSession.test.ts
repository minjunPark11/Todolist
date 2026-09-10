import { describe, expect, it, vi } from "vitest";
import { createTaskRevisionSession, TaskRevisionBlocked, type RevisionCheckpoint, type RevisionReply, type RevisionSnapshot, type RevisionWrite } from "./taskRevisionSession";

type Item = { id: string; title: string };
const original = { id: "t", title: "Original" };
const conflict = () => Object.assign(new Error("TASK_REVISION_CONFLICT"), { code: "40001" });
function fixture(restored?: RevisionCheckpoint<Item>) {
  let snapshot: RevisionSnapshot<Item> = { userId: "u", rows: [{ id: "t", revision: 1, data: original }], tombstones: [] };
  let checkpoint: RevisionCheckpoint<Item> | undefined = restored;
  let active = true;
  let loseResponse = false;
  let failPersist = false;
  let serial = 0;
  const receipts = new Map<string, RevisionReply<Item>>();
  const read = vi.fn(async () => structuredClone(snapshot));
  const write = vi.fn(async (request: RevisionWrite<Item>): Promise<RevisionReply<Item>> => {
    const known = receipts.get(request.writeId);
    if (known) return known;
    const row = snapshot.rows.find((r) => r.id === request.id);
    if ((row?.revision ?? 0) !== request.expectedRevision) throw conflict();
    let reply: RevisionReply<Item>;
    snapshot.rows = snapshot.rows.filter((r) => r.id !== request.id);
    if (request.data === null) { snapshot.tombstones.push(request.id); reply = { id: request.id, deleted: true }; }
    else { reply = { id: request.id, revision: request.expectedRevision + 1, data: request.data }; snapshot.rows.push(reply); }
    receipts.set(request.writeId, reply);
    if (loseResponse) { loseResponse = false; throw new Error("response lost"); }
    return reply;
  });
  const deps = { read, write, id: () => `w${++serial}`, active: () => active,
    persist: (s: RevisionCheckpoint<Item>) => { if (failPersist) throw new Error("disk full"); checkpoint = structuredClone(s); } };
  const session = createTaskRevisionSession("u", deps, restored);
  return { session, deps, read, write,
    get checkpoint() { return checkpoint!; },
    get snapshot() { return snapshot; },
    set snapshot(value) { snapshot = value; },
    set active(value: boolean) { active = value; },
    set loseResponse(value: boolean) { loseResponse = value; },
    set failPersist(value: boolean) { failPersist = value; },
  };
}

describe("durable task revision session", () => {
  it("writes only pending tasks and keeps DB revision outside Task data", async () => {
    const f = fixture(); await f.session.refresh();
    f.session.capture([original]); await f.session.flush(); expect(f.write).not.toHaveBeenCalled();
    f.session.capture([{ ...original, title: "Edited" }]); await f.session.flush();
    expect(f.write.mock.calls[0][0]).toEqual({ id: "t", data: { id: "t", title: "Edited" }, expectedRevision: 1, writeId: "w1" });
    expect(f.session.hasPending).toBe(false);
    expect(f.session.rows[0].revision).toBe(2);
  });
  it("preserves an offline draft across app restart and refresh", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "Offline" }]);
    const restarted = createTaskRevisionSession("u", f.deps, f.checkpoint);
    await restarted.refresh();
    expect(restarted.visibleTasks()).toEqual([{ id: "t", title: "Offline" }]);
    await restarted.flush(); expect(restarted.rows[0].data.title).toBe("Offline");
  });
  it("detects remote conflict on reload without rebasing local intent onto the new revision", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "Local" }]);
    f.snapshot = { ...f.snapshot, rows: [{ id: "t", revision: 2, data: { ...original, title: "Remote" } }] };
    const restarted = createTaskRevisionSession("u", f.deps, f.checkpoint); await restarted.refresh();
    await expect(restarted.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
    expect(f.write).not.toHaveBeenCalled();
    expect(restarted.checkpoint.conflicts.t).toMatchObject({ local: { title: "Local" }, remote: { data: { title: "Remote" }, revision: 2 } });
    expect(restarted.checkpoint.pending.t.expectedRevision).toBe(1);
  });
  it("preserves a local delete intent against a remotely edited task", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([]);
    f.snapshot.rows[0] = { id: "t", revision: 2, data: { ...original, title: "Remote" } };
    await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
    expect(f.session.visibleTasks()).toEqual([]);
    expect(f.checkpoint.conflicts.t.local).toBeNull();
    expect(f.snapshot.rows).toHaveLength(1);
  });
  it("does not overwrite another task discovered while reading a conflict", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "Local" }]);
    f.snapshot.rows = [{ id: "t", revision: 2, data: { ...original, title: "Remote" } }, { id: "new", revision: 1, data: { id: "new", title: "Other device" } }];
    await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
    f.session.capture([{ ...original, title: "Local" }]);
    expect(f.session.checkpoint.pending.new).toBeUndefined();
  });
  it("continues saving independent tasks despite a conflict", async () => {
    const f = fixture(); await f.session.refresh();
    f.session.capture([{ ...original, title: "Local" }, { id: "new", title: "New" }]);
    f.snapshot.rows[0] = { id: "t", revision: 2, data: { ...original, title: "Remote" } };
    await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
    expect(f.snapshot.rows.find((r) => r.id === "new")?.data.title).toBe("New");
    expect(f.checkpoint.pending.new).toBeUndefined();
  });
  it("retries the original receipt after restart without duplicating the write", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "Local" }]);
    f.loseResponse = true; await expect(f.session.flush()).rejects.toThrow("response lost");
    const restarted = createTaskRevisionSession("u", f.deps, f.checkpoint); await restarted.refresh(); await restarted.flush();
    expect(f.write.mock.calls.map(([r]) => r.writeId)).toEqual(["w1", "w1"]);
    expect(f.snapshot.rows[0].revision).toBe(2);
    expect(restarted.hasPending).toBe(false);
  });
  it("retains newer edits made while an earlier write is in flight", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "First" }]);
    const normalWrite = f.deps.write;
    let resolve!: (v: RevisionReply<Item>) => void;
    f.deps.write = vi.fn(async (request) => { const reply = await normalWrite(request); return new Promise<RevisionReply<Item>>((r) => { resolve = () => r(reply); }); });
    const saving = f.session.flush();
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    f.session.capture([{ ...original, title: "Second" }]); resolve({ id: "unused", deleted: true }); await saving;
    expect(f.session.hasPending).toBe(true);
    expect(f.session.checkpoint.pending.t).toEqual({ data: { ...original, title: "Second" }, expectedRevision: 2 });
    f.deps.write = normalWrite; await f.session.flush();
    expect(f.snapshot.rows[0]).toMatchObject({ revision: 3, data: { title: "Second" } });
  });
  it("does not mistake a stale receipt for permission to overwrite a newer remote revision", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "Sent" }]);
    f.loseResponse = true; await expect(f.session.flush()).rejects.toThrow();
    f.snapshot.rows[0] = { id: "t", revision: 3, data: { ...original, title: "Other device after receipt" } };
    const restarted = createTaskRevisionSession("u", f.deps, f.checkpoint); await restarted.refresh();
    await expect(restarted.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
    expect(restarted.rows[0].revision).toBe(3);
    expect(restarted.checkpoint.conflicts.t.local?.title).toBe("Sent");
  });
  it("never writes when local persistence fails or account changes", async () => {
    const f = fixture(); await f.session.refresh(); f.session.capture([{ ...original, title: "Local" }]);
    f.failPersist = true; await expect(f.session.flush()).rejects.toThrow("disk full"); expect(f.write).not.toHaveBeenCalled();
    f.failPersist = false; f.active = false;
    await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked); expect(f.write).not.toHaveBeenCalled();
  });
  it("rejects a stale load completing after a successful local save", async () => {
    const f = fixture(); await f.session.refresh(); const stale = structuredClone(f.snapshot);
    f.session.capture([{ ...original, title: "Local" }]); await f.session.flush();
    expect(() => f.session.adopt(stale)).toThrow("newer task save");
    expect(f.session.rows[0].data.title).toBe("Local");
  });
  it("rejects another account's snapshot or persisted outbox", async () => {
    const f = fixture(); await f.session.refresh();
    expect(() => createTaskRevisionSession("other", f.deps, f.checkpoint)).toThrow("Invalid");
    expect(() => f.session.adopt({ ...f.snapshot, userId: "other" })).toThrow("Account changed");
  });
  it("separates work waiting on a person from work waiting on the network", async () => {
    // `preserveConflict` parks a contested edit in `pending` as well as in
    // `conflicts`, so `hasPending` stays true until somebody picks a version.
    // Anything asking "is there still something to send?" in order to decide
    // whether to WAIT gets the wrong answer from it — a conflict does not
    // clear itself, and waiting on one waits forever. That is what froze
    // Google sync behind four device conflicts.
    const f = fixture(); await f.session.refresh();
    f.session.capture([{ ...original, title: "Mine" }]);
    f.snapshot.rows[0] = { id: "t", revision: 5, data: { ...original, title: "Theirs" } };
    await f.session.refresh();
    await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);

    expect(f.session.hasConflicts).toBe(true);
    expect(f.session.hasPending).toBe(true);       // parked, and it always will be
    expect(f.session.hasUnsentEdits).toBe(false);  // nothing the network can finish
  });

  it("counts an edit to an uncontested task as still unsent", async () => {
    const f = fixture(); await f.session.refresh();
    f.session.capture([{ ...original, title: "Mine" }, { id: "other", title: "Untouched elsewhere" }]);
    f.snapshot.rows[0] = { id: "t", revision: 5, data: { ...original, title: "Theirs" } };
    await f.session.refresh();
    f.failPersist = false;
    // The second row writes; the first is contested. Only the contested one
    // is left parked, so once flush has run there is nothing unsent.
    await expect(f.session.flush()).rejects.toBeInstanceOf(TaskRevisionBlocked);
    expect(f.session.hasUnsentEdits).toBe(false);
    expect(f.snapshot.rows.some((r) => r.id === "other")).toBe(true);

    // A fresh edit to a task nobody is arguing about is unsent again.
    f.session.capture([...f.session.visibleTasks().filter((t) => t.id !== "other"), { id: "other", title: "Changed again" }]);
    expect(f.session.hasUnsentEdits).toBe(true);
  });

  it("accepts convergent content and handles arbitrary task IDs as data", async () => {
    const f = fixture(); await f.session.refresh();
    f.session.capture([{ ...original, title: "Same" }, { id: "__proto__", title: "Safe ID" }]);
    f.snapshot.rows[0] = { id: "t", revision: 2, data: { ...original, title: "Same" } };
    await f.session.refresh(); await f.session.flush();
    expect(f.session.hasConflicts).toBe(false);
    expect(f.snapshot.rows.find((r) => r.id === "__proto__")?.data.title).toBe("Safe ID");
  });
});
