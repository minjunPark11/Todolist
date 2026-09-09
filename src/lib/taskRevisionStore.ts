import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "../types";
import { normalizeTask } from "../domain/plannerData/normalize";
import { TaskRevisionBlocked, type RevisionCheckpoint, type RevisionReply, type RevisionRow, type RevisionSnapshot, type RevisionWrite } from "../domain/sync/taskRevisionSession";

export const taskRevisionStorageKey = (userId: string) => `focusflow.task-revisions.v1:${userId}`;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TaskRevisionBlocked("Invalid task revision response.");
  return value as Record<string, unknown>;
}
function row(value: unknown): RevisionRow<Task> {
  const v = record(value);
  if (typeof v.id !== "string" || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 || record(v.data).id !== v.id) {
    throw new TaskRevisionBlocked("Invalid task revision row.");
  }
  return { id: v.id, revision: Number(v.revision), data: normalizeTask(v.data as Task) };
}

/** Only absence of migration 021 permits legacy mode. Network/permission errors never do. */
export async function taskRevisionEnabled(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from("google_task_sync_accounts").select("enabled").eq("user_id", userId).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return false;
    throw error;
  }
  if (data && typeof data.enabled !== "boolean") throw new TaskRevisionBlocked("Invalid task sync account configuration.");
  return data?.enabled === true;
}

export async function readTaskRevisionSnapshot(client: SupabaseClient, userId: string): Promise<RevisionSnapshot<Task>> {
  const { data, error } = await client.rpc("read_task_revision_snapshot");
  if (error) throw error;
  const result = record(data);
  if (result.userId !== userId || !Array.isArray(result.rows) || !Array.isArray(result.tombstones) ||
      !result.tombstones.every((id) => typeof id === "string")) throw new TaskRevisionBlocked("Account changed or invalid task snapshot.");
  const rows = result.rows.map(row);
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new TaskRevisionBlocked("Duplicate task revision rows.");
  return { userId, rows, tombstones: result.tombstones as string[] };
}

export async function writeTaskRevision(client: SupabaseClient, userId: string, request: RevisionWrite<Task>): Promise<RevisionReply<Task>> {
  const { data, error } = await client.rpc("write_task_revision", {
    p_task_id: request.id, p_expected_revision: request.expectedRevision,
    p_data: request.data, p_write_id: request.writeId, p_expected_user_id: userId,
  });
  if (error) throw error;
  const result = record(data);
  if (result.id !== request.id) throw new TaskRevisionBlocked("Unexpected task write response.");
  if (request.data === null && result.deleted === true) return { id: request.id, deleted: true };
  if (request.data === null || result.deleted === true) throw new TaskRevisionBlocked("Unexpected task deletion response.");
  return row(result);
}

export function restoreTaskRevisionCheckpoint(raw: string | null, userId: string): RevisionCheckpoint<Task> | undefined {
  if (!raw) return undefined;
  try {
    const v = record(JSON.parse(raw));
    if (v.version !== 1 || v.userId !== userId || !Array.isArray(v.rows) || !Array.isArray(v.tombstones) ||
        !v.tombstones.every((id) => typeof id === "string")) throw new Error();
    const rows = v.rows.map(row);
    for (const [id, pending] of Object.entries(record(v.pending))) {
      const p = record(pending);
      if (!Number.isSafeInteger(p.expectedRevision) || Number(p.expectedRevision) < 0 ||
          (p.data !== null && record(p.data).id !== id)) throw new Error();
    }
    for (const [id, write] of Object.entries(record(v.inflight))) {
      const w = record(write);
      if (w.id !== id || typeof w.writeId !== "string" || !Number.isSafeInteger(w.expectedRevision) ||
          Number(w.expectedRevision) < 0 || (w.data !== null && record(w.data).id !== id)) throw new Error();
    }
    record(v.conflicts);
    return { ...v, rows } as unknown as RevisionCheckpoint<Task>;
  } catch {
    // Do not erase corrupt outboxes or silently start at revision zero.
    throw new TaskRevisionBlocked("작업 동기화 기록을 읽지 못했습니다. 로컬 기록을 보존하고 동기화를 중단했습니다. / Task sync checkpoint could not be read.");
  }
}
