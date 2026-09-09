import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const op = "00000000-0000-0000-0000-000000000003";
const next = "00000000-0000-0000-0000-000000000004";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values('${user}'),('${other}');`);
  await db.exec(readFileSync("supabase/migrations/027_google_oauth_lifecycle.sql", "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("reset role; truncate google_oauth_operations;"); });
afterAll(async () => { await db?.close(); });
async function begin(id = op, actor = user) {
  return (await db.query<{ result: { acquired: boolean; uncertain?: boolean } }>("select begin_google_oauth_operation($1,$2,'connect') result", [id, actor])).rows[0].result;
}
async function finish(state: string, actor = user) {
  return (await db.query<{ result: { finished: boolean } }>("select finish_google_oauth_operation($1,$2,$3) result", [op, actor, state])).rows[0].result;
}
it("serializes across users, and permits a new operation only after completion", async () => {
  expect((await begin()).acquired).toBe(true);
  expect((await begin(next, other)).acquired).toBe(false);
  expect((await finish("completed")).finished).toBe(true);
  expect((await begin(next, other)).acquired).toBe(true);
});
it("idempotently retries receipts but cannot reuse a completed ID for another request", async () => {
  await begin(); expect((await begin()).acquired).toBe(true);
  expect((await begin(op, other)).acquired).toBe(false);
  expect((await finish("completed", other)).finished).toBe(false);
  await finish("completed"); expect((await finish("completed")).finished).toBe(true);
  expect((await begin()).acquired).toBe(false);
  expect((await finish("uncertain")).finished).toBe(false);
});
it("never expires a crashed or uncertain operation based on time", async () => {
  await begin(); await db.exec("update google_oauth_operations set started_at=clock_timestamp()-interval '10 days';");
  expect((await begin(next)).acquired).toBe(false);
  await finish("uncertain");
  expect(await begin(next)).toEqual({ acquired: false, uncertain: true });
  expect((await finish("completed")).finished).toBe(false);
});
it("restricts recovery to an administrator and preserves its evidence", async () => {
  await begin(); await finish("uncertain");
  await db.exec("set role service_role;");
  await expect(db.query("select recover_google_oauth_operation($1,'checked')", [op])).rejects.toThrow("permission denied");
  await db.exec("reset role;");
  await expect(db.query("select recover_google_oauth_operation($1,'')", [op])).rejects.toThrow("RECOVERY_EVIDENCE_REQUIRED");
  await db.query("select recover_google_oauth_operation($1,'incident/42: old invocation stopped; remote outcome verified')", [op]);
  expect((await begin(next)).acquired).toBe(true);
  expect((await db.query("select recovery_evidence from google_oauth_operations where operation_id=$1", [op])).rows[0]).toHaveProperty("recovery_evidence", "incident/42: old invocation stopped; remote outcome verified");
});
it("denies client access", async () => {
  await db.exec("set role authenticated;");
  await expect(begin()).rejects.toThrow("permission denied");
  await expect(db.exec("select * from google_oauth_operations;")).rejects.toThrow("permission denied");
});
