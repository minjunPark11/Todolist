// 038: 회차 영수증에 보존 규칙을 준다.
//
// 이 표는 나이로 지울 수 없다. 기록이 아니라 멱등 장부라서, 지우면 다음 패스가 같은
// 회차를 다시 보낸다. 그래서 여기서 고정하는 것의 대부분은 "지우지 않는다" 다.
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";
const live = "00000000-0000-0000-0000-0000000000a1";
const old = "00000000-0000-0000-0000-0000000000a2";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,service_role;
    insert into auth.users values('${user}');`);
  for (const file of ["001_initial_schema.sql", "007_lists.sql", "017_google_calendar.sql", "019_google_calendar_sources.sql",
    "021_google_inbound_cursor.sql", "022_google_sync_protocol.sql", "023_google_legacy_mapping_import.sql",
    "024_google_verified_grant.sql", "025_google_calendar_binding.sql", "026_google_reconnect_mapping.sql",
    "027_google_oauth_lifecycle.sql", "028_google_inbound_execution.sql", "029_google_task_outbound.sql",
    "030_google_task_reviews.sql", "031_google_task_event_lifecycle.sql", "032_google_task_manual_recovery.sql",
    "033_google_task_repeat_transfer.sql", "034_google_task_history_retention.sql",
    "035_google_protocol_retirement.sql", "036_google_sync_timezone_repin.sql",
    "037_google_task_occurrence_outbound.sql", "038_google_occurrence_receipt_retention.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
  }
}, 60000);

afterAll(async () => { await db?.close(); });

async function receipt(generation: string, calendarId = "cal", date = "2026-09-16") {
  await db.query(`insert into google_task_occurrence_receipts
    (user_id,generation,calendar_id,master_event_id,occurrence_date,kind,fields,source,timezone)
    values($1,$2,$3,'master',$4,'occurrence-patch','{}','{}','Asia/Seoul')`, [user, generation, calendarId, date]);
}
const dates = async () => (await db.query<{ generation: string; occurrence_date: string }>(
  `select generation,occurrence_date from google_task_occurrence_receipts order by occurrence_date`)).rows;
const prune = () => db.query<{ prune_google_task_history: number }>(`select prune_google_task_history($1)`, [user]);

beforeEach(async () => {
  await db.exec(`reset role;
    truncate google_task_occurrence_receipts,google_task_sync_accounts,google_calendar_connections,tasks;
    insert into google_task_sync_accounts(user_id) values('${user}');
    insert into google_calendar_connections(user_id,calendar_id,connection_generation,sync_timezone)
      values('${user}','cal','${live}','Asia/Seoul');`);
});

it("keeps a receipt for the generation the connection is on, however old", async () => {
  // The whole point. This row is not history, it is "we already sent that
  // occurrence" — dropping it re-sends the write to Google.
  await receipt(live);
  await prune();
  expect(await dates()).toEqual([{ generation: live, occurrence_date: "2026-09-16" }]);
});

it("drops one left behind by an earlier generation", async () => {
  // Unreachable by construction: the snapshot only ever reads the current
  // generation (037), and the primary key carries the generation, so a
  // reconnect strands every row of the old one forever.
  await receipt(old);
  await receipt(live, "cal", "2026-09-23");
  await prune();
  expect(await dates()).toEqual([{ generation: live, occurrence_date: "2026-09-23" }]);
});

it("drops one left behind by an earlier calendar", async () => {
  await receipt(live, "other-calendar");
  await prune();
  expect(await dates()).toEqual([]);
});

it("counts what it removed alongside what the older passes compacted", async () => {
  await receipt(old);
  await receipt(old, "cal", "2026-09-23");
  expect((await prune()).rows[0].prune_google_task_history).toBe(2);
});

it("leaves everything alone while the account has no connection at all", async () => {
  // Between a disconnect and a reconnect there is no current generation, so
  // every row would look stale. 026 can carry mappings across that gap; a
  // prune that ran in the middle would throw away what it might have matched.
  await receipt(old);
  await receipt(live);
  await db.exec(`delete from google_calendar_connections where user_id='${user}';`);
  await prune();
  expect((await dates()).length).toBe(2);
});

it("never reaches another account's receipts", async () => {
  await db.exec(`insert into auth.users values('00000000-0000-0000-0000-0000000000ff');`);
  await db.query(`insert into google_task_occurrence_receipts
    (user_id,generation,calendar_id,master_event_id,occurrence_date,kind,fields,source,timezone)
    values('00000000-0000-0000-0000-0000000000ff',$1,'cal','master','2026-09-16','occurrence-patch','{}','{}','Asia/Seoul')`, [old]);
  await prune();
  expect((await db.query(`select count(*)::int n from google_task_occurrence_receipts`)).rows[0]).toEqual({ n: 1 });
  await db.exec(`delete from auth.users where id='00000000-0000-0000-0000-0000000000ff';`);
});

it("is what the whole-fleet pass and the snapshot read both call", async () => {
  // 034 calls `prune_google_task_history` by name from both places, so the
  // wrapper is picked up without either being touched. If that stopped being
  // true, orphans would only be cleared by a manual call nobody makes.
  await receipt(old);
  await db.query(`select prune_all_google_task_history()`);
  expect(await dates()).toEqual([]);
});
