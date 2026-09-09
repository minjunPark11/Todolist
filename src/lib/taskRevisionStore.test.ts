import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readTaskRevisionSnapshot, restoreTaskRevisionCheckpoint, taskRevisionEnabled, writeTaskRevision } from "./taskRevisionStore";
import { normalizeTask } from "../domain/plannerData/normalize";

const task = normalizeTask({ id: "t", title: "Work", createdAt: "2026-09-08", updatedAt: "2026-09-08" });
function client(reply: unknown) {
  const rpc = vi.fn().mockResolvedValue(reply);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(reply) };
  return { rpc, query, api: { rpc, from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient };
}
describe("revision RPC transport", () => {
  it.each(["42P01", "PGRST205"])("allows legacy mode only for missing migration %s", async (code) => {
    expect(await taskRevisionEnabled(client({ error: { code } }).api, "u")).toBe(false);
  });
  it.each(["42501", "500", "PGRST202"])("never downgrades on %s", async (code) => {
    await expect(taskRevisionEnabled(client({ error: { code } }).api, "u")).rejects.toMatchObject({ code });
  });
  it("reads and validates server revisions without placing them on Task", async () => {
    const c = client({ data: { userId: "u", rows: [{ id: "t", data: task, revision: 9 }], tombstones: [] } });
    const result = await readTaskRevisionSnapshot(c.api, "u");
    expect(result.rows[0]).toEqual({ id: "t", data: task, revision: 9 });
    expect(result.rows[0].data).not.toHaveProperty("revision");
    await expect(readTaskRevisionSnapshot(c.api, "other")).rejects.toThrow("Account changed");
  });
  it("sends the expected account and durable write ID and never falls back to table upsert", async () => {
    const c = client({ data: { id: "t", data: task, revision: 2 } });
    await writeTaskRevision(c.api, "u", { id: "t", data: task, expectedRevision: 1, writeId: "receipt" });
    expect(c.rpc).toHaveBeenCalledWith("write_task_revision", { p_task_id: "t", p_data: task, p_expected_revision: 1, p_write_id: "receipt", p_expected_user_id: "u" });
    expect(c.api.from).not.toHaveBeenCalled();
    c.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
    await expect(writeTaskRevision(c.api, "u", { id: "t", data: task, expectedRevision: 1, writeId: "receipt" })).rejects.toMatchObject({ code: "PGRST202" });
    expect(c.api.from).not.toHaveBeenCalled();
  });
  it("does not discard unreadable durable drafts", () => {
    expect(() => restoreTaskRevisionCheckpoint("broken", "u")).toThrow("checkpoint");
    expect(() => restoreTaskRevisionCheckpoint(JSON.stringify({ version: 1, userId: "other" }), "u")).toThrow("checkpoint");
    expect(restoreTaskRevisionCheckpoint(null, "u")).toBeUndefined();
  });
});
