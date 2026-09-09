import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.google_task_sync_accounts(user_id uuid primary key, enabled boolean not null default false);`);
  await db.exec(readFileSync("supabase/migrations/022_google_sync_protocol.sql", "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("reset role; truncate google_task_sync_accounts;"); });
afterAll(async () => { await db?.close(); });
async function authorize(protocol: number, expiry: number | null = null) {
  return (await db.query<{ result: { allowed: boolean } }>("select authorize_google_token($1,$2,$3) result", [user, protocol, expiry])).rows[0].result;
}
it("rechecks cutover after preflight and refuses a late legacy token", async () => {
  expect((await authorize(1)).allowed).toBe(true);
  await db.exec(`update google_task_sync_accounts set minimum_google_protocol=2;`);
  expect((await authorize(1, 3600)).allowed).toBe(false);
  expect((await authorize(2, 3600)).allowed).toBe(true);
});
it("requires both cutover drain and recorded token expiry before activation", async () => {
  await authorize(1, 3600);
  await db.exec("update google_task_sync_accounts set minimum_google_protocol=2;");
  await expect(db.exec("update google_task_sync_accounts set enabled=true;")).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
  await db.exec("update google_task_sync_accounts set google_protocol_cutover_at=clock_timestamp()-interval '66 minutes';");
  await expect(db.exec("update google_task_sync_accounts set enabled=true;")).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
  await db.exec("update google_task_sync_accounts set legacy_google_token_valid_until=clock_timestamp()-interval '6 minutes'; update google_task_sync_accounts set enabled=true;");
  await expect(db.exec("update google_task_sync_accounts set minimum_google_protocol=1;")).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
});
it("does not shorten the tracked expiry on a later short token", async () => {
  await authorize(1, 3600);
  await authorize(1, 60);
  const result = await db.query<{ valid: boolean }>("select legacy_google_token_valid_until > clock_timestamp()+interval '59 minutes' valid from google_task_sync_accounts");
  expect(result.rows[0].valid).toBe(true);
});
it("keeps authorization RPC service-only", async () => {
  await db.exec("set role authenticated;");
  await expect(authorize(2)).rejects.toThrow("permission denied");
  await db.exec("reset role; set role service_role;");
  expect((await authorize(1)).allowed).toBe(true);
});
