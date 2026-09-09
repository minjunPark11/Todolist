import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { runGoogleTaskInbound, type GoogleTaskInboundDeps } from "../../lib/googleTaskInboundExecutor";
import { randomUUID } from "node:crypto";
let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";
const generation = "00000000-0000-0000-0000-000000000002";
const run = "00000000-0000-0000-0000-000000000003";
const entry = { eventId: "e", expected: [{ taskId: "t", revision: 1 }], source: { id: "e" }, decision: { kind: "register", taskId: "t", evidenceRef: "review/1" } };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,service_role;
    insert into auth.users values('${user}');`);
  for (const file of ["001_initial_schema.sql", "007_lists.sql", "017_google_calendar.sql", "019_google_calendar_sources.sql", "021_google_inbound_cursor.sql", "022_google_sync_protocol.sql", "023_google_legacy_mapping_import.sql", "024_google_verified_grant.sql", "025_google_calendar_binding.sql", "026_google_reconnect_mapping.sql", "027_google_oauth_lifecycle.sql", "028_google_inbound_execution.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
  }
}, 30000);
beforeEach(async () => {
  await db.exec(`reset role;
    truncate lists,google_verified_connection_history,google_calendar_sources,google_calendar_tokens,google_legacy_mapping_imports,google_task_inbound_records,google_task_mappings,google_task_sync_accounts,google_calendar_connections,tasks;
    insert into google_task_sync_accounts(user_id,minimum_google_protocol) values('${user}',2);
    update google_task_sync_accounts set google_protocol_cutover_at=clock_timestamp()-interval '66 minutes';
    insert into google_calendar_connections(user_id,calendar_id,connection_generation) values('${user}','cal','${generation}');
    insert into tasks(id,user_id,data) values('t','${user}','{"googleEventId":"e","title":"Local edit"}');`);
});
afterAll(async () => { await db?.close(); });
async function bindingSnapshot() {
  return (await db.query<{ result: { refreshToken: string; subject: string; grantVersion: string; generation: string | null } }>("select read_google_binding_snapshot($1) result", [user])).rows[0].result;
}
async function bind(snapshot: Awaited<ReturnType<typeof bindingSnapshot>>, calendar = "cal", zone = "Asia/Seoul", email = "new@example.com") {
  return (await db.query<{ result: { bound: boolean } }>("select bind_verified_google_calendar($1,$2,$3,$4,$5,$6,$7,$8) result", [user, snapshot.refreshToken, snapshot.subject, snapshot.grantVersion, snapshot.generation, calendar, zone, email])).rows[0].result;
}
async function seedVerifiedToken() {
  await db.exec(`insert into google_calendar_tokens(user_id,refresh_token,google_subject) values('${user}','refresh','subject');`);
}
async function executorFixture(eventId="promoted") {
  await seedVerifiedToken();await bind(await bindingSnapshot());
  const snapshot=await bindingSnapshot();
  await db.exec(`update google_task_sync_accounts set enabled=true;
    insert into lists(id,user_id,data) values('inbox','${user}','{"kind":"inbox"}');`);
  let journal:unknown=null;
  const deps:GoogleTaskInboundDeps={
    rpc:async(name,args)=> {
      if(!["claim_google_task_sync","read_google_task_sync_snapshot","release_google_task_sync","commit_google_task_inbound"].includes(name)) throw new Error("Unexpected RPC");
      const keys=Object.keys(args);if(keys.some(k=>!/^p_[a-z_]+$/.test(k))) throw new Error("Unexpected argument");
      return (await db.query<{result:unknown}>(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(",")}) result`,
        keys.map(k=>k==="p_entries"?JSON.stringify(args[k]):args[k]))).rows[0].result;
    },
    fetch:async()=>new Response(JSON.stringify({items:[{id:eventId,summary:"Promoted",start:{date:"2026-09-09"},end:{date:"2026-09-10"}}],nextSyncToken:"next"})),
    uuid:randomUUID,assertCurrent:async()=>{},readJournal:async()=>journal,writeJournal:async value=>{journal=structuredClone(value);},exclusive:async work=>work(),
  };
  return {deps,snapshot,run:()=>runGoogleTaskInbound({userId:user,generation:snapshot.generation!,accessToken:"access"},deps),journal:()=>journal};
}
it("executes actual lease, snapshot, plan and atomic commit RPCs against Postgres",async()=> {
  const f=await executorFixture();
  await db.exec(`set request.jwt.claim.sub='${user}';set role authenticated;`);
  const result=await f.run();expect(result.tasks).toHaveLength(1);expect(f.journal()).toBeNull();
  await db.exec("reset role;");
  expect((await db.query("select data->>'title' title,data->>'listId' list_id from tasks where id<>'t'")).rows).toEqual([{title:"Promoted",list_id:"inbox"}]);
  expect((await db.query("select sync_token,sync_revision,lease_owner from google_calendar_connections")).rows).toEqual([{sync_token:"next",sync_revision:1,lease_owner:null}]);
});
it("enforces review preservation in Postgres even if a client submits a create",async()=> {
  const f=await executorFixture("held");
  const decision={kind:"review",reason:"ambiguous-mapping",legacyReason:"ownership-unverified",taskIds:["t"]};
  await db.query("insert into google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision) values($1,$2,'cal','held','{\"id\":\"held\"}',$3)",[user,f.snapshot.generation,JSON.stringify(decision)]);
  await db.exec(`set request.jwt.claim.sub='${user}';set role authenticated;`);
  expect((await f.run()).tasks).toHaveLength(0);
  const owner=randomUUID();
  const lease=await f.deps.rpc("claim_google_task_sync",{p_generation:f.snapshot.generation,p_owner:owner}) as {fence:number};
  await expect(f.deps.rpc("commit_google_task_inbound",{p_generation:f.snapshot.generation,p_calendar_id:"cal",p_sync_revision:1,p_owner:owner,p_fence:lease.fence,
    p_pass_id:randomUUID(),p_next_sync_token:"bad",p_entries:[{eventId:"held",source:{id:"held"},expected:[],decision:{kind:"create"}}]})).rejects.toThrow("REVIEW_RESOLUTION_REQUIRED");
  await db.exec("reset role;");
  expect((await db.query("select decision from google_task_inbound_records where event_id='held'")).rows).toEqual([{decision}]);
  expect((await db.query("select sync_token from google_calendar_connections")).rows).toEqual([{sync_token:"next"}]);
});
async function detach(snapshot: Awaited<ReturnType<typeof bindingSnapshot>>) {
  return (await db.query<{ result: { disconnected: boolean } }>("select disconnect_google_calendar($1,$2,$3) result", [user, snapshot.grantVersion, snapshot.generation])).rows[0].result;
}
async function seedReconnectHistory() {
  await seedVerifiedToken(); await bind(await bindingSnapshot());
  const snapshot = await bindingSnapshot();
  await db.exec(`insert into google_task_mappings(user_id,generation,calendar_id,event_id,task_id,base)
    values('${user}','${snapshot.generation}','cal','e','t','{"title":"agreed"}');
    insert into google_task_mappings(user_id,generation,calendar_id,event_id,task_id,state)
    values('${user}','${snapshot.generation}','cal','gone-event','gone-task','deleted');
    insert into google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision)
    values('${user}','${snapshot.generation}','cal','excluded','{"id":"excluded"}','{"kind":"skip","reason":"excluded"}');
    update google_calendar_connections set sync_token='old-cursor',sync_revision=9;
    insert into google_calendar_sources(user_id,calendar_id) values('${user}','source');`);
  expect((await detach(snapshot)).disconnected).toBe(true);
  return snapshot;
}
it("restores only same-subject same-calendar history into a fresh generation, including exclusions and tombstones", async () => {
  const old = await seedReconnectHistory();
  expect((await db.query("select * from google_calendar_sources")).rows).toHaveLength(0);
  expect((await grant("subject")).stored).toBe(true);
  expect((await bind(await bindingSnapshot())).bound).toBe(true);
  const fresh = await bindingSnapshot();
  expect(fresh.generation).not.toBe(old.generation);
  const mappings = await db.query("select event_id,state,base from google_task_mappings where generation=$1 order by event_id", [fresh.generation]);
  expect(mappings.rows).toEqual([{ event_id: "e", state: "active", base: { title: "agreed" } }, { event_id: "gone-event", state: "deleted", base: null }]);
  expect((await db.query("select decision from google_task_inbound_records where generation=$1", [fresh.generation])).rows).toEqual([{ decision: { kind: "skip", reason: "excluded" } }]);
  expect((await db.query("select sync_token,sync_revision from google_calendar_connections")).rows).toEqual([{ sync_token: null, sync_revision: 0 }]);
  expect((await bind(fresh)).bound).toBe(true);
  expect((await db.query("select * from google_task_mappings where generation=$1", [fresh.generation])).rows).toHaveLength(2);
});
it("isolates another account even when calendar ID and email match", async () => {
  await seedReconnectHistory();
  await grant("other-subject");
  expect((await bind(await bindingSnapshot())).bound).toBe(true);
  const fresh = await bindingSnapshot();
  expect((await db.query("select * from google_task_mappings where generation=$1", [fresh.generation])).rows).toHaveLength(0);
});
it("refuses a changed historical timezone without creating a partial connection", async () => {
  await seedReconnectHistory(); await grant("subject");
  expect((await bind(await bindingSnapshot(), "cal", "UTC")).bound).toBe(false);
  expect((await db.query("select * from google_calendar_connections")).rows).toHaveLength(0);
});
it("preserves deletion while disconnected and rejects old disconnect attempts against a newer grant", async () => {
  await seedReconnectHistory();
  await db.exec("delete from tasks where id='t';");
  await grant("subject");
  const old = await bindingSnapshot();
  await grant("subject");
  expect((await detach(old)).disconnected).toBe(false);
  expect((await bind(await bindingSnapshot())).bound).toBe(true);
  const fresh = await bindingSnapshot();
  expect((await db.query("select state from google_task_mappings where generation=$1 and event_id='e'", [fresh.generation])).rows).toEqual([{ state: "deleted" }]);
});
it("never archives unverified connections and denies access to reconnect history", async () => {
  await db.exec("delete from google_calendar_connections;");
  expect((await db.query("select * from google_verified_connection_history")).rows).toHaveLength(0);
  await db.exec("set role authenticated;");
  await expect(db.query("select * from google_verified_connection_history")).rejects.toThrow("permission denied");
  await expect(db.query("select read_google_disconnect_snapshot($1)", [user])).rejects.toThrow("permission denied");
});
it("rolls back history, connection and token deletion together when source cleanup fails", async () => {
  await seedVerifiedToken(); await bind(await bindingSnapshot());
  const snapshot = await bindingSnapshot();
  await db.exec(`insert into google_calendar_sources(user_id,calendar_id) values('${user}','source');
    create function fail_source_cleanup() returns trigger language plpgsql as $$ begin raise exception 'cleanup failed'; end $$;
    create trigger fail_source_cleanup before delete on google_calendar_sources for each row execute function fail_source_cleanup();`);
  try {
    await expect(detach(snapshot)).rejects.toThrow("cleanup failed");
    expect((await bindingSnapshot()).generation).toBe(snapshot.generation);
    expect((await db.query("select * from google_verified_connection_history")).rows).toHaveLength(0);
  } finally {
    await db.exec("drop trigger fail_source_cleanup on google_calendar_sources; drop function fail_source_cleanup();");
  }
});
it("binds a new generation without transferring unverified historical mappings", async () => {
  await apply();
  await seedVerifiedToken();
  expect((await bind(await bindingSnapshot())).bound).toBe(true);
  const snapshot = await bindingSnapshot();
  expect(snapshot.generation).not.toBe(generation);
  expect((await db.query("select generation from google_task_mappings")).rows).toEqual([{ generation }]);
  expect((await db.query("select google_subject,sync_timezone from google_calendar_connections")).rows).toEqual([{ google_subject: "subject", sync_timezone: "Asia/Seoul" }]);
});
it("keeps the verified generation and cursor when only display email changes", async () => {
  await seedVerifiedToken(); await bind(await bindingSnapshot());
  const snapshot = await bindingSnapshot();
  await db.exec("update google_calendar_connections set sync_token='cursor',sync_revision=7;");
  expect((await bind(snapshot, "cal", "Asia/Seoul", "changed@example.com")).bound).toBe(true);
  expect((await bindingSnapshot()).generation).toBe(snapshot.generation);
  expect((await db.query("select sync_token,sync_revision,account_email from google_calendar_connections")).rows).toEqual([{ sync_token: "cursor", sync_revision: 7, account_email: "changed@example.com" }]);
  expect((await bind(snapshot, "cal", "UTC")).bound).toBe(false);
  expect((await bind(snapshot, "different")).bound).toBe(false);
});
it("refuses stale grant versions even when the refresh token string is unchanged", async () => {
  await seedVerifiedToken();
  const snapshot = await bindingSnapshot();
  await db.exec("update google_calendar_tokens set refresh_token=refresh_token;");
  expect((await bind(snapshot)).bound).toBe(false);
  expect((await bind(await bindingSnapshot())).bound).toBe(true);
  const bound = await bindingSnapshot();
  await db.exec("delete from google_calendar_connections;");
  expect((await bind(bound)).bound).toBe(false);
});
it("protects the binding and credential snapshot from client calls", async () => {
  await seedVerifiedToken();
  const snapshot = await bindingSnapshot();
  await db.exec(`grant select,insert,update on google_calendar_connections to authenticated;
    set request.jwt.claim.sub='${user}'; set role authenticated;`);
  await expect(bindingSnapshot()).rejects.toThrow("permission denied");
  await expect(bind(snapshot)).rejects.toThrow("permission denied");
  await expect(db.exec("update google_calendar_connections set calendar_id='other';")).rejects.toThrow("VERIFIED_CALENDAR_REQUIRED");
});
async function grant(subject: string, email = "display@example.com") {
  return (await db.query<{ result: { stored: boolean } }>("select store_verified_google_grant($1,$2,$3,$4,$5) result", [user, "new-refresh", "openid email", subject, email])).rows[0].result;
}
it("does not attach a newly verified identity to an unverified old connection", async () => {
  expect((await grant("new-subject")).stored).toBe(false);
  expect((await db.query("select * from google_calendar_tokens")).rows).toHaveLength(0);
});
it("accepts first identity and same subject with a changed email, rejecting a different subject", async () => {
  await db.exec("delete from google_calendar_connections;");
  expect((await grant("subject")).stored).toBe(true);
  expect((await grant("subject", "changed@example.com")).stored).toBe(true);
  expect((await grant("different", "changed@example.com")).stored).toBe(false);
  expect((await db.query("select google_subject,verified_email from google_calendar_tokens")).rows).toEqual([{ google_subject: "subject", verified_email: "changed@example.com" }]);
});
it("preserves a legacy token and prevents unverified service writes", async () => {
  await db.exec(`insert into google_calendar_tokens(user_id,refresh_token) values('${user}','legacy');
    grant select,insert,update,delete on google_calendar_tokens to service_role;`);
  expect((await grant("subject")).stored).toBe(false);
  expect((await db.query("select refresh_token from google_calendar_tokens")).rows).toEqual([{ refresh_token: "legacy" }]);
  await db.exec("set role service_role;");
  await expect(db.exec("update google_calendar_tokens set refresh_token='replacement';")).rejects.toThrow("VERIFIED_GOOGLE_GRANT_REQUIRED");
  await db.exec("reset role; set role authenticated;");
  await expect(grant("subject")).rejects.toThrow("permission denied");
});
async function apply(entries: unknown[] = [entry], gen = generation) {
  return (await db.query<{ result: { replayed: boolean } }>("select import_google_legacy_mappings($1,$2,$3,$4,$5::jsonb) result", [user, gen, "cal", run, JSON.stringify(entries)])).rows[0].result;
}
it("imports without changing Task content, revision, base or cursor; response loss replays", async () => {
  expect((await apply()).replayed).toBe(false);
  expect((await apply()).replayed).toBe(true);
  expect((await db.query("select base,etag,state from google_task_mappings")).rows).toEqual([{ base: null, etag: null, state: "active" }]);
  expect((await db.query("select revision,data->>'title' title from tasks")).rows).toEqual([{ revision: 1, title: "Local edit" }]);
  expect((await db.query("select sync_revision,sync_token from google_calendar_connections")).rows).toEqual([{ sync_revision: 0, sync_token: null }]);
});
it("rejects changed revisions and duplicate claimants added after audit", async () => {
  await db.exec("update tasks set data=data||'{\"title\":\"New edit\"}';");
  await expect(apply()).rejects.toThrow("STALE_IMPORT_TASKS");
  await db.exec(`insert into tasks(id,user_id,data) values('other','${user}','{"googleEventId":"e"}');`);
  await expect(apply([{ ...entry, expected: [{ taskId: "t", revision: 2 }] }])).rejects.toThrow("STALE_IMPORT_TASKS");
});
it("rolls back the whole batch if a later entry is stale", async () => {
  await expect(apply([entry, { ...entry, eventId: "missing" }])).rejects.toThrow("STALE_IMPORT_TASKS");
  expect((await db.query("select * from google_task_mappings")).rows).toHaveLength(0);
  expect((await db.query("select * from google_legacy_mapping_imports")).rows).toHaveLength(0);
});
it("persists unresolved ownership for later review instead of registering", async () => {
  await apply([{ ...entry, decision: { kind: "review", reason: "ownership-unverified" } }]);
  expect((await db.query("select * from google_task_mappings")).rows).toHaveLength(0);
  expect((await db.query<{ decision: unknown }>("select decision from google_task_inbound_records")).rows[0].decision).toMatchObject({ kind: "review", legacyReason: "ownership-unverified", taskIds: ["t"] });
});
it("requires a drained inactive account and matching connection generation", async () => {
  await expect(apply([entry], run)).rejects.toThrow("STALE_IMPORT_SCOPE");
  await db.exec("update google_task_sync_accounts set google_protocol_cutover_at=clock_timestamp();");
  await expect(apply()).rejects.toThrow("IMPORT_REQUIRES_DRAINED_INACTIVE_ACCOUNT");
});
it("rejects client calls and registers trash without reviving it", async () => {
  await db.exec("set role authenticated;");
  await expect(apply()).rejects.toThrow("permission denied");
  await db.exec("reset role; update tasks set data=data||'{\"deletedAt\":\"2026-09-09\"}'; set role service_role;");
  await apply([{ ...entry, expected: [{ taskId: "t", revision: 2 }] }]);
  await db.exec("reset role;");
  expect((await db.query("select state from google_task_mappings")).rows).toEqual([{ state: "trashed" }]);
});
