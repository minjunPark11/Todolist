import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const USER = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";
const GENERATION = "00000000-0000-0000-0000-000000000003";
const OWNER = "00000000-0000-0000-0000-000000000004";
const PASS = "00000000-0000-0000-0000-000000000005";
const fields = { title: "Work", description: "Notes", startDate: "", dueDate: "2026-09-08", startTime: "", endTime: "" };
const source = { id: "e1", summary: "Work", start: { date: "2026-09-08" }, end: { date: "2026-09-09" }, etag: "v1" };
const create = { eventId: "e1", source, expected: [], decision: { kind: "create", listId: "inbox", fields } };
let db: PGlite;

async function asUser(user = USER) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${user}'; set role authenticated;`);
}
async function admin(sql: string) { await db.exec(`reset role; ${sql}`); await asUser(); }
async function commit(entries: unknown[] = [create], overrides: { revision?: number; fence?: number; owner?: string; pass?: string; token?: string; generation?: string } = {}) {
  const result = await db.query<{ result: { tasks: Array<{ id: string; data: Record<string, unknown>; revision: number }>; syncRevision: number } }>(
    "select public.commit_google_task_inbound($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as result",
    [overrides.generation ?? GENERATION, "cal", overrides.revision ?? 0, overrides.owner ?? OWNER,
      overrides.fence ?? 1, overrides.pass ?? PASS, overrides.token ?? "next-token", JSON.stringify(entries)],
  );
  return result.rows[0].result;
}
async function state() {
  const tasks = (await db.query("select id,data,revision from public.tasks order by id")).rows;
  const connections = (await db.query("select sync_token,sync_revision from public.google_calendar_connections")).rows;
  const records = (await db.query("select event_id,decision,revision from public.google_task_inbound_records")).rows;
  return { tasks, connections, records };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    insert into auth.users values('${USER}'),('${OTHER}');
  `);
  for (const name of ["001_initial_schema.sql", "007_lists.sql", "017_google_calendar.sql"]) {
    const sql = readFileSync(`supabase/migrations/${name}`, "utf8").replace('create extension if not exists "pgcrypto";', "");
    await db.exec(sql);
  }
  await db.exec("grant select,insert,update,delete on all tables in schema public to authenticated,service_role;");
  await db.exec(readFileSync("supabase/migrations/021_google_inbound_cursor.sql", "utf8"));
}, 30_000);

beforeEach(async () => {
  await db.exec(`reset role;
    truncate public.google_task_inbound_passes,public.google_task_inbound_records,public.google_task_mappings,
      public.google_task_sync_accounts,public.google_calendar_connections,public.tasks,public.lists,public.task_revision_tombstones,public.task_write_receipts;
    insert into public.lists(id,user_id,data) values('inbox','${USER}','{"kind":"inbox"}');
    insert into public.google_task_sync_accounts values('${USER}',true),('${OTHER}',true);
    insert into public.google_calendar_connections(user_id,calendar_id,connection_generation,sync_timezone,
      lease_owner,lease_until,lease_fence)
      values('${USER}','cal','${GENERATION}','Asia/Seoul','${OWNER}',clock_timestamp()+interval '120 seconds',1);
  `);
  await asUser();
});
afterAll(async () => { await db?.close(); });

describe("021 actual Postgres migration and transaction contracts", () => {
  it("commits a generated task, unique mapping, record and cursor together", async () => {
    const result = await commit();
    expect(result.syncRevision).toBe(1);
    expect(result.tasks[0].revision).toBe(1);
    expect(result.tasks[0].data).toMatchObject({ title: "Work", listId: "inbox", googleEventId: "e1" });
    expect((await state()).connections).toEqual([{ sync_token: "next-token", sync_revision: 1 }]);
    expect((await db.query("select * from google_task_mappings")).rows).toHaveLength(1);
  });
  it("returns the receipt after response loss without creating twice or rewinding a newer cursor", async () => {
    const result = await commit();
    await commit([], { revision: 1, pass: "00000000-0000-0000-0000-000000000006", token: "newer" });
    expect(await commit()).toEqual(result);
    expect((await state()).tasks).toHaveLength(1);
    expect((await state()).connections[0]).toEqual({ sync_token: "newer", sync_revision: 2 });
  });
  it("rejects reused pass IDs with changed payload", async () => {
    await commit();
    await expect(commit([], { token: "different" })).rejects.toThrow("PASS_ID_REUSED");
  });
  it("rolls back earlier writes when a later entry fails", async () => {
    await expect(commit([create, { ...create, eventId: "broken" }])).rejects.toThrow("INVALID_SYNC_ENTRY");
    expect(await state()).toEqual({ tasks: [], connections: [{ sync_token: null, sync_revision: 0 }], records: [] });
  });
  it("rejects stale device scopes and expired/lost leases", async () => {
    await expect(commit([], { revision: 1 })).rejects.toThrow("SYNC_PRECONDITION_FAILED");
    await expect(commit([], { fence: 0 })).rejects.toThrow("SYNC_PRECONDITION_FAILED");
    await expect(commit([], { owner: OTHER })).rejects.toThrow("SYNC_PRECONDITION_FAILED");
    await admin("update google_calendar_connections set lease_until=clock_timestamp()-interval '1 second';");
    await expect(commit()).rejects.toThrow("SYNC_PRECONDITION_FAILED");
  });
  it("does not apply an old pass to a new connection generation", async () => {
    await expect(commit([], { generation: OTHER })).rejects.toThrow("SYNC_CONNECTION_CHANGED");
  });
  it("serializes lease ownership and increments the fence when an expired owner returns", async () => {
    const claim = (owner: string) => db.query<{ c: { fence: number } }>("select claim_google_task_sync($1,$2) c", [GENERATION, owner]);
    expect((await claim(OWNER)).rows[0].c.fence).toBe(1);
    await expect(claim(OTHER)).rejects.toThrow("SYNC_BUSY");
    await admin("update google_calendar_connections set lease_until=clock_timestamp()-interval '1 second';");
    expect((await claim(OTHER)).rows[0].c.fence).toBe(2);
    await expect(commit()).rejects.toThrow("SYNC_PRECONDITION_FAILED");
  });
  it("blocks legacy direct task and cursor writes once enabled", async () => {
    await expect(db.query("insert into tasks(id,user_id,data) values('legacy',$1,'{}')", [USER])).rejects.toThrow("TASK_REVISION_REQUIRED");
    await expect(db.exec("update google_calendar_connections set sync_token='skip';")).rejects.toThrow("SYNC_RPC_REQUIRED");
    await expect(db.exec("update google_task_sync_accounts set enabled=false;")).rejects.toThrow("permission denied");
  });
  it("keeps legacy writes working for non-enabled accounts, with server revisions", async () => {
    await admin("update google_task_sync_accounts set enabled=false;");
    await db.query("insert into tasks(id,user_id,data,revision) values('legacy',$1,'{}',500)", [USER]);
    expect((await state()).tasks[0]).toMatchObject({ revision: 1 });
    await db.exec("update tasks set data='{\"title\":\"changed\"}',revision=900;");
    expect((await state()).tasks[0]).toMatchObject({ revision: 2 });
    await expect(commit()).rejects.toThrow("TASK_SYNC_NOT_ENABLED");
  });
  it("uses auth.uid, does not expose another account, and denies anon RPC execution", async () => {
    await commit();
    await asUser(OTHER);
    expect((await state()).tasks).toEqual([]);
    expect((await db.query("select * from google_task_mappings")).rows).toEqual([]);
    await expect(commit()).rejects.toThrow("SYNC_CONNECTION_CHANGED");
    await db.exec("reset role; set role anon;");
    await expect(commit()).rejects.toThrow("permission denied");
  });
  it("preserves local edits by rejecting stale task revisions before advancing the cursor", async () => {
    const t = (await commit()).tasks[0];
    await db.query("select write_task_revision($1,$2,$3::jsonb)", [t.id, t.revision, JSON.stringify({ ...t.data, title: "Local", priority: "high" })]);
    const update = { ...create, expected: [{ taskId: t.id, revision: 1 }], decision: { kind: "update", fields: { ...fields, title: "Remote" } } };
    await expect(commit([update], { revision: 1, pass: OTHER })).rejects.toThrow("TASK_REVISION_CONFLICT");
    expect((await state()).tasks[0]).toMatchObject({ data: { title: "Local", priority: "high" }, revision: 2 });
    expect((await state()).connections[0]).toMatchObject({ sync_revision: 1 });
  });
  it("applies only shared fields and never falsely updates googleSyncedAt", async () => {
    const t = (await commit()).tasks[0];
    const data = { ...t.data, priority: "high", googleSyncedAt: "old", tags: ["tag"] };
    await db.query("select write_task_revision($1,1,$2::jsonb)", [t.id, JSON.stringify(data)]);
    const entry = { ...create, expected: [{ taskId: t.id, revision: 2 }], decision: { kind: "update", fields: { ...fields, title: "Remote" } } };
    const saved = (await commit([entry], { revision: 1, pass: OTHER })).tasks[0];
    expect(saved.data).toMatchObject({ priority: "high", tags: ["tag"], title: "Remote", googleSyncedAt: "old" });
    expect(saved.revision).toBe(3);
  });
  it("saves conflict source before advancing but does not overwrite task or base", async () => {
    const t = (await commit()).tasks[0];
    const decision = { kind: "conflict", local: fields, remote: { ...fields, title: "Remote" }, base: fields };
    await commit([{ ...create, expected: [{ taskId: t.id, revision: 1 }], decision }], { revision: 1, pass: OTHER });
    expect((await state()).tasks[0]).toMatchObject({ data: { title: "Work" }, revision: 1 });
    expect((await state()).records[0]).toMatchObject({ decision });
    expect((await db.query("select base from google_task_mappings")).rows[0]).toEqual({ base: fields });
  });
  it("rejects an occurrence cancellation and preserves all state", async () => {
    const t = (await commit()).tasks[0];
    const before = await state();
    await expect(commit([{ ...create, source: { id: "e1", status: "cancelled", recurringEventId: "master" },
      expected: [{ taskId: t.id, revision: 1 }], decision: { kind: "trash" } }], { revision: 1, pass: OTHER })).rejects.toThrow("INVALID_CANCELLATION");
    expect(await state()).toEqual(before);
  });
  it("keeps a mapping tombstone on permanent deletion and rejects ID reuse", async () => {
    const t = (await commit()).tasks[0];
    await db.query("select write_task_revision($1,1,null)", [t.id]);
    expect((await db.query("select state from google_task_mappings")).rows).toEqual([{ state: "deleted" }]);
    await expect(db.query("select write_task_revision($1,0,$2::jsonb)", [t.id, JSON.stringify(t.data)])).rejects.toThrow("TASK_ID_RETIRED");
  });
  it("rejects a second device's create for an already mapped event even with a refreshed cursor", async () => {
    await commit();
    await expect(commit([create], { revision: 1, pass: OTHER })).rejects.toThrow("MAPPING_CHANGED");
    expect((await state()).tasks).toHaveLength(1);
    expect((await state()).connections[0]).toMatchObject({ sync_revision: 1 });
  });
  it("rejects create into an unrelated list and prevents app-only field injection", async () => {
    await expect(commit([{ ...create, decision: { ...create.decision, listId: "not-inbox" } }])).rejects.toThrow("INBOX_CHANGED");
    await expect(commit([{ ...create, decision: { ...create.decision, fields: { ...fields, priority: "high" } } }])).rejects.toThrow("INVALID_SHARED_FIELDS");
    expect((await state()).tasks).toEqual([]);
  });
  it("records unsupported events durably without fabricating a task", async () => {
    const entry = { ...create, decision: { kind: "skip", reason: "unsupported-schedule" } };
    await commit([entry]);
    expect((await state()).tasks).toEqual([]);
    expect((await state()).records[0]).toMatchObject({ decision: entry.decision });
    expect((await state()).connections[0]).toMatchObject({ sync_revision: 1 });
  });
  it("protects non-Google task IDs against delete/recreate ABA conflicts too", async () => {
    const data = { id: "local-task", title: "Local" };
    await db.query("select write_task_revision('local-task',0,$1::jsonb)", [JSON.stringify(data)]);
    await db.exec("select write_task_revision('local-task',1,null);");
    await expect(db.query("select write_task_revision('local-task',0,$1::jsonb)", [JSON.stringify(data)])).rejects.toThrow("TASK_ID_RETIRED");
  });
  it("tracks local trash state and only releases the current owner's lease", async () => {
    const t = (await commit()).tasks[0];
    await db.query("select write_task_revision($1,1,$2::jsonb)", [t.id, JSON.stringify({ ...t.data, deletedAt: "2026-09-08T00:00:00Z" })]);
    expect((await db.query("select state from google_task_mappings")).rows).toEqual([{ state: "trashed" }]);
    expect((await db.query<{ released: boolean }>("select release_google_task_sync($1,$2,0) released", [GENERATION, OWNER])).rows[0].released).toBe(false);
    expect((await db.query<{ released: boolean }>("select release_google_task_sync($1,$2,1) released", [GENERATION, OWNER])).rows[0].released).toBe(true);
    await expect(commit([], { revision: 1, pass: OTHER })).rejects.toThrow("SYNC_PRECONDITION_FAILED");
  });
  it("returns authoritative scoped snapshots and blocks service-role legacy writers", async () => {
    await commit();
    const snapshot = (await db.query<{ s: { tasks: unknown[]; mappings: unknown[] } }>("select read_google_task_sync_snapshot($1) s", [GENERATION])).rows[0].s;
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.mappings).toHaveLength(1);
    await db.exec("reset role; set role service_role;");
    await expect(db.exec("update tasks set data='{}';")).rejects.toThrow("TASK_REVISION_REQUIRED");
    await expect(db.exec("delete from tasks;")).rejects.toThrow("TASK_REVISION_REQUIRED");
  });
  it("replays task write/delete receipts without changing newer state", async () => {
    const data = JSON.stringify({ id: "local", title: "One" });
    const save = () => db.query("select write_task_revision('local',0,$1::jsonb,$2,$3) r", [data, PASS, USER]);
    const receipt = (await save()).rows;
    await db.query("select write_task_revision('local',1,$1::jsonb,$2,$3)", [JSON.stringify({ id: "local", title: "Two" }), OWNER, USER]);
    expect((await save()).rows).toEqual(receipt);
    expect((await state()).tasks[0]).toMatchObject({ data: { title: "Two" }, revision: 2 });
    const remove = () => db.query("select write_task_revision('local',2,null,$1,$2) r", [OTHER, USER]);
    const deleted = (await remove()).rows;
    expect((await remove()).rows).toEqual(deleted);
    await expect(db.query("select write_task_revision('different',0,$1::jsonb,$2,$3)", [data, PASS, USER])).rejects.toThrow("WRITE_ID_REUSED");
  });
  it("asserts the intended account at the DB write boundary and reads all task revisions after disconnect", async () => {
    await expect(db.query("select write_task_revision('local',0,'{\"id\":\"local\"}',$1,$2)", [PASS, OTHER])).rejects.toThrow("AUTH_ACCOUNT_CHANGED");
    const t = (await commit()).tasks[0];
    await db.query("select write_task_revision($1,1,null)", [t.id]);
    await db.exec("delete from google_calendar_connections;");
    const snapshot = (await db.query<{ s: { userId: string; rows: unknown[]; tombstones: string[] } }>("select read_task_revision_snapshot() s")).rows[0].s;
    expect(snapshot).toEqual({ userId: USER, rows: [], tombstones: [t.id] });
  });
});
