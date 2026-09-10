/** Account-owned durable outbox. Task revisions are storage metadata, not Task fields. */
export interface RevisionRow<T> { id: string; revision: number; data: T }
export interface RevisionSnapshot<T> { userId: string; rows: RevisionRow<T>[]; tombstones: string[] }
export interface RevisionWrite<T> { id: string; expectedRevision: number; data: T | null; writeId: string }
export type RevisionReply<T> = RevisionRow<T> | { id: string; deleted: true };
interface Pending<T> {
  data: T | null;
  expectedRevision: number;
  /**
   * The row as it stood at `expectedRevision` — the point this edit left from.
   *
   * Held so a conflict can be answered by looking at WHO CHANGED WHAT rather
   * than only at "these two differ". Without it, a field-level merge cannot
   * tell an edit from an untouched value, and would pick a side for fields
   * neither device touched (TASK_CONFLICT_FIELD_MERGE_DESIGN.md §2.1).
   *
   * The invariant is one sentence: **this is the data of `expectedRevision`.**
   * Everywhere that sets one sets the other, or the pair lies.
   *
   * Optional, and the checkpoint stays `version: 1`, because a stored outbox
   * has no base and bumping the version would reject every one of them at
   * load. Absent means "merge nothing here, ask as before" — the behaviour
   * that shipped (§D2). The next edit writes a new entry and it has a base.
   */
  base?: T | null;
}
export interface RevisionCheckpoint<T> {
  version: 1;
  userId: string;
  rows: RevisionRow<T>[];
  tombstones: string[];
  pending: Record<string, Pending<T>>;
  inflight: Record<string, RevisionWrite<T>>;
  conflicts: Record<string, { local: T | null; remote: RevisionRow<T> | null }>;
}

export class TaskRevisionBlocked extends Error {
  readonly retryable = false;
  constructor(message = "다른 기기의 작업 변경과 충돌했습니다. 로컬 편집은 보존되어 있으며 자동 덮어쓰기를 중단했습니다. / Task conflict: local edits preserved.") {
    super(message);
    this.name = "TaskRevisionBlocked";
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function sameRevisionData(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function retryTaskSyncError(error: unknown): boolean {
  if (error instanceof TaskRevisionBlocked) return false;
  const code = (error as { code?: string } | null)?.code;
  return code !== "42501" && code !== "22023" && code !== "PGRST202";
}

export interface RevisionSessionDeps<T> {
  read: () => Promise<RevisionSnapshot<T>>;
  write: (request: RevisionWrite<T>) => Promise<RevisionReply<T>>;
  persist: (state: RevisionCheckpoint<T>) => void;
  id: () => string;
  active: () => boolean;
}

export function createTaskRevisionSession<T extends { id: string }>(
  userId: string, deps: RevisionSessionDeps<T>, restored?: RevisionCheckpoint<T>,
) {
  if (restored && (restored.version !== 1 || restored.userId !== userId)) throw new TaskRevisionBlocked("Invalid task sync checkpoint.");
  let state: RevisionCheckpoint<T> = restored ?? {
    version: 1, userId, rows: [], tombstones: [], pending: {}, inflight: {}, conflicts: {},
  };
  state = { ...state,
    pending: Object.assign(Object.create(null), state.pending),
    inflight: Object.assign(Object.create(null), state.inflight),
    conflicts: Object.assign(Object.create(null), state.conflicts),
  };
  let busy = false;
  function assertActive() { if (!deps.active()) throw new TaskRevisionBlocked("Account changed; task save stopped."); }
  function persist() { assertActive(); deps.persist(state); }
  const rowOf = (id: string) => state.rows.find((row) => row.id === id);
  function reconcile() {
    for (const [id, pending] of Object.entries(state.pending)) {
      if (state.inflight[id]) continue; // Resolve the original receipt before classifying response loss.
      const remote = rowOf(id);
      if (sameRevisionData(remote?.data ?? null, pending.data) && (remote || state.tombstones.includes(id))) {
        delete state.pending[id]; delete state.conflicts[id];
      } else if ((remote?.revision ?? 0) !== pending.expectedRevision || state.tombstones.includes(id)) {
        state.conflicts[id] = { local: pending.data, remote: remote ?? null };
      }
    }
  }
  function capture(tasks: readonly T[]) {
    assertActive();
    const desired = new Map(tasks.map((task) => [task.id, task]));
    const ids = new Set([...state.rows.map((row) => row.id), ...Object.keys(state.pending), ...desired.keys()]);
    for (const id of ids) {
      const data = desired.get(id) ?? null;
      const remote = rowOf(id);
      if (sameRevisionData(data, remote?.data ?? null) && !state.inflight[id]) {
        delete state.pending[id]; delete state.conflicts[id];
      } else {
        const previous = state.pending[id];
        // A later capture replaces the content and keeps everything about
        // where the edit started — including a base that is ABSENT. Filling it
        // in from the current row here would pair today's data with an older
        // `expectedRevision`, which is the one way this pair can lie.
        state.pending[id] = previous
          ? { ...previous, data }
          : { data, expectedRevision: remote?.revision ?? 0, base: remote?.data ?? null };
        if (state.conflicts[id]) state.conflicts[id].local = data;
      }
    }
    reconcile();
    persist(); // Must succeed BEFORE any network write.
  }
  function adopt(snapshot: RevisionSnapshot<T>) {
    assertActive();
    if (busy) throw new TaskRevisionBlocked("Task save is in progress; retry refresh after it completes.");
    if (snapshot.userId !== userId) throw new TaskRevisionBlocked("Account changed while loading tasks.");
    const incoming = new Map(snapshot.rows.map((row) => [row.id, row]));
    if (state.rows.some((row) => (incoming.has(row.id) && incoming.get(row.id)!.revision < row.revision) ||
        (!incoming.has(row.id) && !snapshot.tombstones.includes(row.id)))) {
      throw new TaskRevisionBlocked("A newer task save completed during refresh. Retry refresh.");
    }
    state.rows = snapshot.rows; state.tombstones = snapshot.tombstones;
    reconcile(); persist();
  }
  async function refresh() { adopt(await deps.read()); }
  function visibleTasks(): T[] {
    const result = new Map(state.rows.map((row) => [row.id, row.data]));
    for (const [id, pending] of Object.entries(state.pending)) {
      if (pending.data === null) result.delete(id); else result.set(id, pending.data);
    }
    return [...result.values()];
  }
  function preserveConflict(id: string, local: T | null) {
    assertActive();
    state.pending[id] = { data: local, expectedRevision: rowOf(id)?.revision ?? 0, base: rowOf(id)?.data ?? null };
    state.conflicts[id] = { local, remote: rowOf(id) ?? null };
    persist();
  }
  async function flush() {
    assertActive();
    if (busy) throw new TaskRevisionBlocked("Concurrent task save stopped.");
    busy = true;
    try {
      // One pass snapshots IDs, but reads each latest pending value before sending.
      for (const id of new Set([...Object.keys(state.inflight), ...Object.keys(state.pending)])) {
        assertActive();
        if (state.conflicts[id]) continue;
        const pending = state.pending[id];
        // Built field by field rather than spread: `pending` carries the base
        // document now, and spreading it would put a whole second copy of the
        // task into every write on the wire and into the stored outbox.
        const request = state.inflight[id] ?? (pending
          ? { id, expectedRevision: pending.expectedRevision, data: pending.data, writeId: deps.id() }
          : undefined);
        if (!request) continue;
        state.inflight[id] = request;
        persist();
        let reply: RevisionReply<T>;
        try { reply = await deps.write(request); }
        catch (error) {
          assertActive();
          if ((error as { code?: string })?.code === "40001" ||
              String((error as { message?: string })?.message).includes("TASK_ID_RETIRED")) {
            delete state.inflight[id];
            const snapshot = await deps.read();
            assertActive();
            if (snapshot.userId !== userId) throw new TaskRevisionBlocked("Account changed while reading a conflict.");
            // A save does not adopt the whole remote workspace into the visible
            // UI. Track only this row here, or the next capture could mistake
            // unseen tasks from another device for intentional local deletes.
            state.rows = [...state.rows.filter((row) => row.id !== id), ...snapshot.rows.filter((row) => row.id === id)];
            if (snapshot.tombstones.includes(id)) state.tombstones = [...new Set([...state.tombstones, id])];
            reconcile();
            if (state.pending[id]) state.conflicts[id] = { local: state.pending[id].data, remote: rowOf(id) ?? null };
            persist();
            continue;
          }
          throw error; // Includes response loss. Retry the same durable writeId.
        }
        assertActive();
        if (reply.id !== id) throw new TaskRevisionBlocked("Unexpected task write response.");
        const known = rowOf(id);
        if (!("deleted" in reply) && known && known.revision > reply.revision) {
          delete state.inflight[id];
          reconcile();
          persist();
          continue;
        }
        state.rows = state.rows.filter((row) => row.id !== id);
        if ("deleted" in reply) state.tombstones = [...new Set([...state.tombstones, id])];
        else state.rows.push(reply);
        delete state.inflight[id];
        if (sameRevisionData(state.pending[id]?.data, request.data)) delete state.pending[id];
        else if (state.pending[id]) {
          // The write landed and newer local content is already queued behind
          // it. That content now leaves from what the server just stored, so
          // the base moves with the revision — they are one fact.
          state.pending[id].expectedRevision = "deleted" in reply ? 0 : reply.revision;
          state.pending[id].base = "deleted" in reply ? null : reply.data;
        }
        delete state.conflicts[id];
        persist();
      }
      reconcile();
      persist();
      if (Object.keys(state.conflicts).length) throw new TaskRevisionBlocked();
    } finally { busy = false; }
  }
  function resolveConflict(id: string, choice: "local" | "remote", expected: { local: T | null; remote: RevisionRow<T> | null }, replacement?: T) {
    assertActive();
    if (busy || !state.conflicts[id] || !sameRevisionData(state.conflicts[id], expected)) throw new TaskRevisionBlocked("Conflict changed; review it again.");
    if (choice === "remote") { delete state.pending[id]; delete state.conflicts[id]; }
    else {
      const remote = rowOf(id), local = replacement ?? state.conflicts[id].local;
      if (local && !remote && state.tombstones.includes(id)) throw new TaskRevisionBlocked("This task was deleted. Copy it to a new task to keep local content.");
      state.pending[id] = { data: local, expectedRevision: remote?.revision ?? 0, base: remote?.data ?? null };
      delete state.conflicts[id];
    }
    persist();
  }
  return { userId, capture, adopt, refresh, flush, visibleTasks, preserveConflict, resolveConflict,
    get rows() { return state.rows; },
    get hasConflicts() { return Object.keys(state.conflicts).length > 0; },
    get hasPending() { return Object.keys(state.pending).length > 0 || Object.keys(state.inflight).length > 0; },
    /**
     * Work that is waiting on the network rather than on a person.
     *
     * `preserveConflict` parks a contested edit in `pending` as well as in
     * `conflicts`, so `hasPending` stays true for as long as nobody picks a
     * version. Anything that asks "is there still something to send?" in order
     * to decide whether to WAIT gets the wrong answer from it: a conflict is
     * not going to clear itself, and waiting on one is waiting forever.
     *
     * `flush` already writes every uncontested row before it raises, so once
     * it has run, what is left here is the true answer.
     */
    get hasUnsentEdits() {
      return Object.keys(state.inflight).length > 0
        || Object.keys(state.pending).some((id) => !state.conflicts[id]);
    },
    get checkpoint() { return state; },
    get busy() { return busy; },
  };
}
