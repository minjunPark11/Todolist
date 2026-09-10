// 036: 동기화 시간대를 다시 고정하는 유일한 경로.
//
// 025 와 026 은 시간대가 다른 바인딩을 거부한다. 그 거절이 옳은 이유는 매핑의
// `base` 가 벽시계 필드라서, 시간대가 바뀌면 그 계정의 모든 base 가 동시에
// 의미를 잃기 때문이다. 036 은 그 거절을 없애지 않고 통제된 문을 하나 낸다.
//
// 그래서 여기서 고정하는 것의 대부분은 "여전히 거절되는 것" 이다. 문을 내는
// 마이그레이션에서 위험한 것은 열리지 않는 경우가 아니라, 열리지 말아야 할 때
// 열리는 경우다.
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let db: PGlite;

it("automatically retimes from saved settings with unresolved reviews and is idempotent", async () => {
  const c = await connectedInLondon();
  const fields = { title: "Meeting", description: "", dueDate: "2026-09-10", startDate: "", startTime: "08:30", endTime: "09:30" };
  await db.query("update tasks set data=data||$1::jsonb", [JSON.stringify(fields)]);
  await db.query("update google_task_mappings set base=$1", [JSON.stringify(fields)]);
  await db.query("insert into settings(id,user_id,data) values('app_settings',$1,$2)", [user, JSON.stringify({ appSettings: { timezone: "Asia/Shanghai" } })]);
  await db.query("insert into google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision) values($1,$2,'cal','e','{\"id\":\"e\"}',$3)",
    [user, c.connection_generation, JSON.stringify({ kind: "conflict", local: fields, remote: { ...fields, title: "Other" } })]);
  await db.exec(`set request.jwt.claim.sub='${user}'; set request.headers='{"x-focusflow-google-sync-protocol":"2"}'; update google_sync_protocol_state set legacy_serving_retired_at=clock_timestamp()-interval '66 minutes'; update google_task_sync_accounts set minimum_google_protocol=2; update google_task_sync_accounts set google_protocol_cutover_at=clock_timestamp()-interval '66 minutes'; update google_task_sync_accounts set enabled=true;`);
  const apply = async () => (await db.query<{r: unknown}>("select apply_google_account_timezone($1) r", [c.connection_generation])).rows[0].r;
  expect(await apply()).toMatchObject({ applied: true, changed: true, timezone: "Asia/Shanghai" });
  expect((await db.query<{data: unknown}>("select data from tasks")).rows[0].data).toMatchObject({ startTime: "15:30", endTime: "16:30" });
  expect((await db.query("select source,revision from google_task_inbound_records")).rows).toEqual([{ source: { id: "e" }, revision: 2 }]);
  expect(await apply()).toMatchObject({ applied: true, changed: false });
  expect((await connection()).sync_token).toBeNull();
});

it("preserves all-day dates and converts winter offsets independently of summer", async () => {
  const f = { title: "Day", description: "", dueDate: "2026-12-10", startDate: "", startTime: "", endTime: "" };
  const retime = async (fields: unknown) => (await db.query<{f: unknown}>("select retime_google_task_fields($1,'Europe/London','Asia/Shanghai') f", [JSON.stringify(fields)])).rows[0].f;
  expect(await retime(f)).toEqual(f);
  expect(await retime({ ...f, startTime: "08:30", endTime: "09:30" })).toMatchObject({ startTime: "16:30", endTime: "17:30" });
});
const user = "00000000-0000-0000-0000-000000000001";

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
    "035_google_protocol_retirement.sql", "036_google_sync_timezone_repin.sql", "037_google_task_occurrence_outbound.sql", "038_google_occurrence_receipt_retention.sql", "039_google_automatic_merge.sql", "040_google_account_timezone.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
  }
}, 60000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`reset role;
    truncate settings,google_task_versions,lists,google_verified_connection_history,google_calendar_sources,google_calendar_tokens,
      google_legacy_mapping_imports,google_task_inbound_records,google_task_outbound_operations,
      google_task_mappings,google_task_sync_accounts,google_calendar_connections,tasks;
    insert into google_task_sync_accounts(user_id) values('${user}');
    insert into google_calendar_tokens(user_id,refresh_token,google_subject) values('${user}','refresh','subject');`);
});

interface Snapshot { refreshToken: string; subject: string; grantVersion: string; generation: string | null }
async function snapshot(): Promise<Snapshot> {
  return (await db.query<{ result: Snapshot }>("select read_google_binding_snapshot($1) result", [user])).rows[0].result;
}
async function bind(zone: string, opts: { calendar?: string; generation?: string | null; grant?: string; refresh?: string } = {}) {
  const s = await snapshot();
  return (await db.query<{ result: { bound: boolean; retimed?: boolean; reason?: string } }>(
    "select bind_verified_google_calendar($1,$2,$3,$4,$5,$6,$7,$8) result",
    [user, opts.refresh ?? s.refreshToken, s.subject, opts.grant ?? s.grantVersion,
     opts.generation === undefined ? s.generation : opts.generation,
     opts.calendar ?? "cal", zone, "someone@example.com"],
  )).rows[0].result;
}
async function connection() {
  return (await db.query<{ sync_timezone: string; sync_token: string | null; sync_revision: string;
    connection_generation: string; account_email: string; lease_fence: string }>(
    "select sync_timezone,sync_token,sync_revision,connection_generation,account_email,lease_fence from google_calendar_connections",
  )).rows[0];
}

/** A verified connection on Europe/London, with one event already mapped to a task. */
async function connectedInLondon() {
  await db.exec(`insert into google_calendar_connections(user_id,calendar_id) values('${user}','cal');`);
  expect((await bind("Europe/London")).bound).toBe(true);
  const c = await connection();
  await db.exec(`insert into tasks(id,user_id,data) values('t','${user}','{"id":"t","title":"Meeting"}');
    insert into google_task_mappings(user_id,generation,calendar_id,event_id,task_id,base,source)
      values('${user}','${c.connection_generation}','cal','e','t','{"startTime":"08:30"}','{"id":"e"}');
    update google_calendar_connections set sync_token='cursor' where user_id='${user}';`);
  return c;
}

it("re-pins in place, and leaves the generation and the mappings where they are", async () => {
  // 제자리인 것이 이 마이그레이션의 전부다. 새 세대에서는 매핑이 따라오지 않아
  // 모든 이벤트가 매핑 없는 것으로 보이고, 같은 일정이 작업으로 한 번 더 생긴다.
  const before = await connectedInLondon();
  expect(await bind("Asia/Seoul")).toEqual({ bound: true, retimed: true });

  const after = await connection();
  expect(after.sync_timezone).toBe("Asia/Seoul");
  expect(after.connection_generation).toBe(before.connection_generation);
  expect((await db.query("select count(*)::int n from google_task_mappings")).rows[0]).toEqual({ n: 1 });
});

it("forces a full re-read, because what changed is how we read and not what Google holds", async () => {
  await connectedInLondon();
  await bind("Asia/Seoul");
  const after = await connection();
  // 증분 커서를 남겨두면 구글이 바꾸지 않은 이벤트는 다시 오지 않는다 — 그리고
  // 여기서 고쳐야 하는 것은 정확히 그 "바뀌지 않은" 이벤트들이다.
  expect(after.sync_token).toBeNull();
});

it("invalidates whatever a client is still holding", async () => {
  const before = await connectedInLondon();
  await bind("Asia/Seoul");
  const after = await connection();
  // 옛 시간대로 계산한 결과를 들고 도착하는 커밋은 거절되어야 한다.
  expect(Number(after.sync_revision)).toBeGreaterThan(Number(before.sync_revision));
  expect(Number(after.lease_fence)).toBeGreaterThan(Number(before.lease_fence));
});

it("does not touch account_email, which would trip the guard that wipes the zone", async () => {
  // 021 line 118: calendar_id 나 account_email 이 바뀌면 세대를 새로 발급하고
  // sync_timezone 을 null 로 만든다. 재고정에서 그것이 돌면 방금 넣은 값이 지워진다.
  await connectedInLondon();
  await db.exec(`update google_calendar_connections set account_email='old@example.com' where user_id='${user}';`);
  expect((await bind("Asia/Seoul")).bound).toBe(true);
  const after = await connection();
  expect(after.account_email).toBe("old@example.com");
  expect(after.sync_timezone).toBe("Asia/Seoul");
});

it("refuses while a sync pass holds the lease", async () => {
  // 그 패스는 옛 시간대로 계산하는 중이다. 그 결과가 새 시간대의 base 위에
  // 얹히면 어느 쪽으로 읽힌 값인지 아무도 모른다.
  await connectedInLondon();
  await db.exec(`update google_calendar_connections set lease_until=clock_timestamp()+interval '1 minute' where user_id='${user}';`);
  expect(await bind("Asia/Seoul")).toEqual({ bound: false, reason: "sync-in-progress" });
  expect((await connection()).sync_timezone).toBe("Europe/London");
});

it("refuses while an outbound write is in flight", async () => {
  await connectedInLondon();
  const c = await connection();
  await db.query(`insert into google_task_outbound_operations
    (user_id,operation_id,generation,calendar_id,event_id,task_id,request,desired,remote,timezone,state,kind)
    values($1,gen_random_uuid(),$2,'cal','e','t','{}','{}','{}','Europe/London','reserved','patch')`,
    [user, c.connection_generation]);
  expect(await bind("Asia/Seoul")).toEqual({ bound: false, reason: "outbound-in-flight" });
});

it("lets a settled outbound write through — only in-flight ones block", async () => {
  await connectedInLondon();
  const c = await connection();
  await db.query(`insert into google_task_outbound_operations
    (user_id,operation_id,generation,calendar_id,event_id,task_id,request,desired,remote,timezone,state,kind)
    values($1,gen_random_uuid(),$2,'cal','e','t','{}','{}','{}','Europe/London','completed','patch')`,
    [user, c.connection_generation]);
  expect((await bind("Asia/Seoul")).bound).toBe(true);
});

it("refuses while a review is still waiting on a person", async () => {
  // 미해결 검토는 옛 시간대에서 계산된 두 값의 비교다. 남겨둔 채 시간대를 바꾸면
  // 사람은 어느 쪽도 더는 참이 아닌 선택지를 고르게 된다.
  await connectedInLondon();
  const c = await connection();
  await db.query(`insert into google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision)
    values($1,$2,'cal','e','{"id":"e"}','{"kind":"conflict"}')`, [user, c.connection_generation]);
  expect(await bind("Asia/Seoul")).toEqual({ bound: false, reason: "reviews-unresolved" });
});

it("lets a resolved review through", async () => {
  await connectedInLondon();
  const c = await connection();
  await db.query(`insert into google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision)
    values($1,$2,'cal','e','{"id":"e"}','{"kind":"acknowledge"}')`, [user, c.connection_generation]);
  expect((await bind("Asia/Seoul")).bound).toBe(true);
});

it("refuses a name that is not a zone", async () => {
  await connectedInLondon();
  await expect(bind("Mars/Olympus_Mons")).rejects.toThrow("INVALID_CALENDAR_BINDING");
  expect((await connection()).sync_timezone).toBe("Europe/London");
});

it("refuses when the caller is looking at a generation that has moved on", async () => {
  await connectedInLondon();
  expect(await bind("Asia/Seoul", { generation: "00000000-0000-0000-0000-0000000000ff" }))
    .toEqual({ bound: false, reason: "generation-changed" });
});

it("refuses when the grant behind the connection is no longer the one presented", async () => {
  // 재고정은 읽기 방식을 통째로 바꾸는 쓰기다. 025 가 바인딩에 요구하는 신원
  // 검사를 여기서 뺄 이유가 없다.
  await connectedInLondon();
  expect(await bind("Asia/Seoul", { refresh: "someone-elses-token" }))
    .toEqual({ bound: false, reason: "grant-changed" });
  expect(await bind("Asia/Seoul", { grant: "00000000-0000-0000-0000-0000000000ff" }))
    .toEqual({ bound: false, reason: "grant-changed" });
});

it("still refuses a different calendar carrying a different zone", async () => {
  // 주체나 캘린더가 다르면 그것은 재고정이 아니라 다른 연결이고, 025 와 026 의
  // 신원 검사가 그대로 판단해야 한다. 036 은 그 판단을 가로채지 않는다.
  await connectedInLondon();
  expect((await bind("Asia/Seoul", { calendar: "other" })).bound).toBe(false);
  expect((await connection()).sync_timezone).toBe("Europe/London");
});

it("still refuses a reconnect that changes the zone", async () => {
  // 026 line 42. 연결을 끊고 다시 붙이는 길은 여전히 막혀 있다 — 새 세대에서는
  // 매핑이 따라오지 않아 같은 일정이 두 번 생기기 때문이다. 036 이 여는 문은
  // 제자리 재고정 하나뿐이다.
  await connectedInLondon();
  await db.exec(`delete from google_calendar_connections where user_id='${user}';`);
  expect((await bind("Asia/Seoul", { generation: null })).bound).toBe(false);
});

it("still binds a connection that has never been verified", async () => {
  await db.exec(`insert into google_calendar_connections(user_id,calendar_id) values('${user}','cal');`);
  expect((await bind("Asia/Seoul"))).toEqual({ bound: true });
  expect((await connection()).sync_timezone).toBe("Asia/Seoul");
});

it("re-verifies an unchanged zone the way it always did, without claiming a re-time", async () => {
  await connectedInLondon();
  expect(await bind("Europe/London")).toEqual({ bound: true });
  expect((await connection()).sync_token).toBe("cursor");
});

it("keeps the function away from the roles the app runs as", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("reset role;");
    await db.exec(`set role ${role};`);
    await expect(db.query(
      "select bind_verified_google_calendar($1,'r','s',$2,null,'cal','Asia/Seoul','e@example.com')",
      [user, "00000000-0000-0000-0000-000000000009"],
    )).rejects.toThrow();
  }
  await db.exec("reset role;");
});

it("applies the complete rollout over the old repin function and prevents legacy picker rebinding", async () => {
  await connectedInLondon();
  const before = await connection();
  await db.exec("begin");
  try {
    for (const file of ["041_google_version_restore.sql", "042_google_repeat_baseline.sql", "043_google_deletion_review.sql", "044_google_timezone_compatibility.sql"]) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace(/^begin;\s*$/gm, "").replace(/^commit;\s*$/gm, ""));
    }
    await db.query("insert into settings(id,user_id,data) values('app_settings',$1,'{\"appSettings\":{\"timezone\":\"Asia/Shanghai\"}}')", [user]);
    expect((await bind("UTC")).bound).toBe(true);
    const after = await connection();
    expect(after.sync_timezone).toBe("Europe/London");
    expect(after.connection_generation).toBe(before.connection_generation);
    expect(after.sync_token).toBe(before.sync_token);
  } finally { await db.exec("rollback"); }
});
