import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

it("merges independent changes atomically and replays the receipt without losing the pre-merge version", async () => {
  const remote = { ...base, description: "Google notes" };
  const merged = { ...local, description: "Google notes" };
  const args = { p_generation: generation, p_calendar_id: "cal", p_sync_revision: 0, p_owner: owner,
    p_fence: request.fence, p_pass_id: randomUUID(), p_next_sync_token: "merged-token",
    p_entries: [{ eventId: "e", source: { ...source, description: "Google notes" }, expected: [{ taskId: "t", revision: 1 }],
      decision: { kind: "merge", fields: merged, remote } }] };
  const result = await rpc("commit_google_task_inbound", args);
  expect(result.tasks[0].data).toMatchObject({ ...merged, priority: "high" });
  expect((await mapping()).base).toEqual(remote);
  expect(await rpc("commit_google_task_inbound", args)).toEqual(result);
  expect((await db.query("select data from google_task_versions")).rows).toEqual([{ data: { id: "t", ...local, priority: "high", listId: "inbox" } }]);
});

it("rejects a forged automatic merge and rolls back the cursor", async () => {
  await expect(rpc("commit_google_task_inbound", { p_generation: generation, p_calendar_id: "cal", p_sync_revision: 0,
    p_owner: owner, p_fence: request.fence, p_pass_id: randomUUID(), p_next_sync_token: "bad-token",
    p_entries: [{ eventId: "e", source, expected: [{ taskId: "t", revision: 1 }],
      decision: { kind: "merge", fields: { ...local, title: "Lost edit" }, remote: base } }] })).rejects.toThrow("INVALID_AUTOMATIC_MERGE");
  await db.exec("reset role");
  expect((await db.query("select sync_revision from google_calendar_connections")).rows).toEqual([{ sync_revision: 0 }]);
});

it("restores a version with CAS, preserves app metadata, and replays the same request", async () => {
  await db.exec("reset role; update tasks set data=data||'{\"description\":\"new notes\"}'::jsonb");
  const version = (await db.query<{id: string}>("select id from google_task_versions")).rows[0].id;
  await auth();
  const args = { p_version_id: version, p_expected_revision: 2, p_write_id: randomUUID() };
  const result = await rpc("restore_google_task_version", args);
  expect(await rpc("restore_google_task_version", args)).toEqual(result);
  await expect(rpc("restore_google_task_version", { ...args, p_expected_revision: 1, p_write_id: randomUUID() })).rejects.toThrow("TASK_REVISION_CONFLICT");
  await db.exec("reset role");
  expect((await db.query<{data: unknown}>("select data from tasks")).rows[0].data).toMatchObject({ description: local.description, priority: "high" });
  await auth(other);
  await expect(rpc("restore_google_task_version", { ...args, p_write_id: randomUUID() })).rejects.toThrow();
});

it("accepts a remote-only repeat edit but rejects a competing app repeat edit", async () => {
  await db.exec("reset role; update google_task_inbound_records set decision='{\"kind\":\"acknowledge\"}'");
  await db.query("update google_task_mappings set base=$1", [JSON.stringify(local)]);
  await auth();
  const args = { ...request, choice: "baseline", base: null };
  await rpc("accept_google_task_repeat", { p_request: args });
  await db.exec("reset role");
  const b = (await db.query<{repeat_base: unknown}>("select repeat_base from google_task_mappings")).rows[0].repeat_base;
  const remote = { ...source, recurrence: ["RRULE:FREQ=DAILY"] };
  await db.query("update google_task_inbound_records set source=$1,revision=2", [JSON.stringify(remote)]);
  await auth();
  const incoming = { ...args, base: b, recordRevision: 2, source: remote, choice: "google", patch: { repeatType: "daily", repeatInterval: 1, repeatDays: [], repeatEndDate: "" } };
  expect(await rpc("accept_google_task_repeat", { p_request: incoming })).toEqual({ applied: true });
  await expect(rpc("accept_google_task_repeat", { p_request: incoming })).rejects.toThrow("STALE_SELECTION");
});

it.each(["keep-task", "accept-delete"])("resolves a deletion conflict with %s without losing task identity", async choice => {
  const cancelled = { id: "e", status: "cancelled" };
  await db.exec("reset role");
  await db.query("update google_task_inbound_records set source=$1,decision=$2", [JSON.stringify(cancelled), JSON.stringify({ kind: "review", reason: "deletion-conflict", taskIds: ["t"] })]);
  await auth();
  const args = { p_operation_id: randomUUID(), p_request: { ...request, source: cancelled, choice } };
  const result = await rpc("resolve_google_task_review", args);
  expect(await rpc("resolve_google_task_review", args)).toEqual(result);
  await db.exec("reset role");
  const row = (await db.query<{data: Record<string, unknown>}>("select data from tasks where id='t'")).rows[0].data;
  expect(row.title).toBe(local.title);
  expect(Boolean(row.deletedAt)).toBe(choice === "accept-delete");
  expect((await mapping()).state).toBe("trashed");
});
import { runReservedGoogleTaskOutbound, type GoogleTaskOutboundDeps } from "../../integrations/google/taskOutbound";
import { runGoogleTaskCycle } from "../../lib/googleTaskCoordinator";
import { occurrenceCandidates } from "../../lib/googleOccurrenceSync";
import { parseGoogleTaskSnapshot } from "../../lib/googleTaskInboundSnapshot";

let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const generation = "00000000-0000-0000-0000-000000000003";
const owner = "00000000-0000-0000-0000-000000000004";
const base = { title: "Base", description: "", startDate: "", dueDate: "2026-09-09", startTime: "", endTime: "" };
const local = { ...base, title: "App" };
const source = { id: "e", etag: '"before"', summary: "Base", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } };
const applied = { ...source, summary: "App", etag: '"after"' };
const instance = { ...source, id: "e_20260916", recurringEventId: "e", originalStartTime: { date: "2026-09-16" },
  start: { date: "2026-09-16" }, end: { date: "2026-09-17" } };
let op: string, dispatch: string, request: Record<string, unknown>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,service_role;
    insert into auth.users values('${user}'),('${other}');`);
  for (const file of ["001_initial_schema.sql", "007_lists.sql", "017_google_calendar.sql", "019_google_calendar_sources.sql",
    "021_google_inbound_cursor.sql", "022_google_sync_protocol.sql", "023_google_legacy_mapping_import.sql", "024_google_verified_grant.sql",
    "025_google_calendar_binding.sql", "026_google_reconnect_mapping.sql", "027_google_oauth_lifecycle.sql", "028_google_inbound_execution.sql", "029_google_task_outbound.sql", "030_google_task_reviews.sql", "031_google_task_event_lifecycle.sql", "032_google_task_manual_recovery.sql", "033_google_task_repeat_transfer.sql", "034_google_task_history_retention.sql", "037_google_task_occurrence_outbound.sql", "038_google_occurrence_receipt_retention.sql", "039_google_automatic_merge.sql", "040_google_account_timezone.sql", "041_google_version_restore.sql", "042_google_repeat_baseline.sql", "043_google_deletion_review.sql", "044_google_timezone_compatibility.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
  }
}, 30000);
beforeEach(async () => {
  op = randomUUID(); dispatch = randomUUID();
  await db.exec(`reset role; truncate settings,google_task_restore_receipts,google_task_versions,google_task_occurrence_receipts,google_task_outbound_operations,google_oauth_operations,google_task_inbound_passes,
    google_task_inbound_records,google_task_mappings,google_task_sync_accounts,google_calendar_connections,tasks;
    insert into settings(id,user_id,data) values('app_settings','${user}','{"appSettings":{"timezone":"Asia/Seoul"}}');
    insert into google_task_sync_accounts(user_id,minimum_google_protocol) values('${user}',2);
    update google_task_sync_accounts set google_protocol_cutover_at=clock_timestamp()-interval '66 minutes',enabled=true;
    insert into google_calendar_connections(user_id,calendar_id,connection_generation,sync_timezone,google_subject,calendar_verified_at)
      values('${user}','cal','${generation}','Asia/Seoul','subject',clock_timestamp());`);
  await db.query("insert into tasks(id,user_id,data) values('t',$1,$2)", [user, JSON.stringify({ id: "t", ...local, priority: "high", listId: "inbox" })]);
  await db.query("insert into google_task_mappings(user_id,generation,calendar_id,event_id,task_id,base,source,etag) values($1,$2,'cal','e','t',$3,$4,'before')", [user, generation, JSON.stringify(base), JSON.stringify(source)]);
  await db.query("insert into google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision) values($1,$2,'cal','e',$3,'{\"kind\":\"keep-local\"}')", [user, generation, JSON.stringify(source)]);
  await auth();
  const lease = await rpc("claim_google_task_sync", { p_generation: generation, p_owner: owner });
  request = { generation, calendarId: "cal", syncRevision: 0, owner, fence: lease.fence,
    taskId: "t", eventId: "e", taskRevision: 1, recordRevision: 1, local, remote: base, source, choice: "automatic" };
});
afterAll(async () => { await db?.close(); });

async function occurrenceFixture(kind = "occurrence-patch") {
  await db.exec(`reset role; update google_task_sync_accounts set occurrence_sync_enabled=true;
    insert into lists(id,user_id,data) values('inbox','${user}','{"kind":"inbox"}') on conflict do nothing;`);
  await db.query("update google_task_mappings set source=$1", [JSON.stringify({ ...source, recurrence: ["RRULE:FREQ=WEEKLY"] })]);
  await db.query("update tasks set data=$1 where id='t'", [JSON.stringify({ id: "t", ...base, repeatType: "weekly", ...(kind === "occurrence-delete" ? { exdates: ["2026-09-16"] } : {}) })]);
  const fields = { ...base, title: "This week only", dueDate: "2026-09-17" };
  await db.query("insert into tasks(id,user_id,data) values('occ',$1,$2)", [user, JSON.stringify({ id: "occ", ...fields, occurrenceOf: "t", recurrenceId: "2026-09-16" })]);
  await auth();
  return { ...request, kind, taskId: kind === "occurrence-delete" ? "t" : "occ", taskRevision: kind === "occurrence-delete" ? 2 : 1, seriesId: "t", seriesRevision: 2,
    masterEventId: "e", eventId: instance.id, occurrenceDate: "2026-09-16", originalStart: "2026-09-16", source: instance,
    remote: { ...base, dueDate: "2026-09-16" }, desired: fields };
}
const reserveOccurrence = (body: Record<string, unknown>) => rpc("reserve_google_task_occurrence", { p_operation_id: op, p_request: body });

it("M6 updates only the instance and recovers a lost response with no second PATCH", async () => {
  const body = await occurrenceFixture();
  expect(await reserveOccurrence(body)).toMatchObject({ state: "reserved" });
  let remote: Record<string, unknown> = instance, writes = 0;
  const deps = worker(async (url, init) => {
    expect(String(url)).toContain(`/events/${instance.id}`);
    if (init?.method === "PATCH") {
      writes++; const patch = JSON.parse(String(init.body));
      expect(patch).not.toHaveProperty("recurrence"); expect((init.headers as Record<string,string>)["If-Match"]).toBe('"before"');
      remote = { ...instance, ...patch, start: { date: "2026-09-17" }, end: { date: "2026-09-18" }, etag: '"moved"' };
      throw Error("response lost");
    }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(writes).toBe(1);
  expect((await mapping()).base).toEqual(base);
  await auth(); expect(await reserveOccurrence(body)).toMatchObject({ state: "completed" });
  const raw = await rpc("read_google_task_sync_snapshot", { p_generation: generation });
  expect(occurrenceCandidates(parseGoogleTaskSnapshot(raw, user, generation))).toEqual([]);
});

it("M6 cancels only the skipped instance and keeps a durable receipt", async () => {
  const body = await occurrenceFixture("occurrence-delete"); await reserveOccurrence(body);
  let writes = 0;
  const result = await runReservedGoogleTaskOutbound(user, op, worker(async (_url, init) => {
    if (init?.method === "DELETE") { writes++; return new Response(null, { status: 204 }); }
    return Response.json(instance);
  }));
  expect(result).toEqual({ state: "completed" }); expect(writes).toBe(1);
  await auth(); const raw = await rpc("read_google_task_sync_snapshot", { p_generation: generation });
  expect(occurrenceCandidates(parseGoogleTaskSnapshot(raw, user, generation))).toEqual([]);
  expect((await mapping()).base).toEqual(base);
});

it("M6 is disabled by default and rejects standalone creation of occurrence rows", async () => {
  const body = await occurrenceFixture();
  await db.exec("reset role; update google_task_sync_accounts set occurrence_sync_enabled=false;"); await auth();
  await expect(reserveOccurrence(body)).rejects.toThrow("OCCURRENCE_SYNC_DISABLED");
  await expect(rpc("reserve_google_task_event", { p_operation_id: op, p_request: { ...body, kind: "create" } })).rejects.toThrow("OCCURRENCE_CANNOT_CREATE");
});

it("M6 rejects a different master or original date and checks task revisions again before dispatch", async () => {
  const body = await occurrenceFixture();
  await expect(reserveOccurrence({ ...body, source: { ...instance, recurringEventId: "foreign" } })).rejects.toThrow("INSTANCE_REQUIRED");
  await expect(reserveOccurrence({ ...body, originalStart: "2026-09-17" })).rejects.toThrow("WRONG_OCCURRENCE");
  await reserveOccurrence(body);
  await rpc("write_task_revision", { p_task_id: "occ", p_expected_revision: 1, p_data: { id: "occ", ...base, title: "newer" } });
  let calls = 0;
  expect(await runReservedGoogleTaskOutbound(user, op, worker(async () => { calls++; return Response.json(instance); }))).toEqual({ state: "aborted" });
  expect(calls).toBe(0);
});

it("M6 does not overwrite a newer Google version and allows a later fresh reservation", async () => {
  const body = await occurrenceFixture(); await reserveOccurrence(body);
  let writes = 0;
  expect(await runReservedGoogleTaskOutbound(user, op, worker(async (_url, init) => {
    if (init?.method === "PATCH") writes++;
    return Response.json({ ...instance, etag: '"newer"' });
  }))).toEqual({ state: "aborted" });
  expect(writes).toBe(0);
});

it.each([401, 412, 429])("M6 retries a rejected HTTP %s write only through a fresh reservation", async (status) => {
  const body = await occurrenceFixture(); await reserveOccurrence(body);
  const result = await runReservedGoogleTaskOutbound(user, op, worker(async (_url, init) =>
    init?.method === "PATCH" ? new Response(null, { status }) : Response.json(instance)));
  expect(result).toEqual({ state: "aborted" });
  op = randomUUID(); await auth(); expect(await reserveOccurrence(body)).toMatchObject({ state: "reserved" });
});

it("M6 holds an unchanged version after timeout and settles a later version without resending", async () => {
  const body = await occurrenceFixture(); await reserveOccurrence(body);
  let remote = instance, writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { writes++; throw Error("timeout before outcome known"); }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  remote = { ...instance, summary: "Edited elsewhere", etag: '"new-version"' };
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "aborted" });
  expect(writes).toBe(1);
});

it("M6 recovers a lost DELETE from a minimal cancelled instance", async () => {
  const body = await occurrenceFixture("occurrence-delete"); await reserveOccurrence(body);
  let removed = false, writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "DELETE") { writes++; removed = true; throw Error("lost"); }
    return Response.json(removed ? { id: instance.id, recurringEventId: "e", originalStartTime: instance.originalStartTime, status: "cancelled" } : instance);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(writes).toBe(1);
});

it("M6 keeps a reservation pending when recovery cannot reach Google", async () => {
  const body = await occurrenceFixture(); await reserveOccurrence(body);
  let unreachable = false, writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { writes++; unreachable = true; throw Error("lost"); }
    if (unreachable) throw Error("offline");
    return Response.json(instance);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(writes).toBe(1);
});

it("M6 rejects another account and direct access to its receipt table", async () => {
  const body = await occurrenceFixture(); await auth(other);
  await expect(reserveOccurrence(body)).rejects.toThrow();
  await expect(db.query("select * from google_task_occurrence_receipts")).rejects.toThrow("permission denied");
});

it("M6 runs two complete cycles without creating an event or reapplying an occurrence", async () => {
  await occurrenceFixture();
  await rpc("release_google_task_sync", { p_generation: generation, p_owner: owner, p_fence: 1 });
  const master = { ...source, recurrence: ["RRULE:FREQ=WEEKLY"] };
  let remote: Record<string, unknown> = instance, writes = 0, journal: unknown = null, intent: unknown = null;
  const http: typeof fetch = async (url, init) => {
    if (init?.method === "POST") throw Error("An occurrence must never be created.");
    if (init?.method === "PATCH") {
      writes++; expect(String(url)).toContain(`/events/${instance.id}`);
      remote = { ...instance, summary: "This week only", start: { date: "2026-09-17" }, end: { date: "2026-09-18" }, etag: '"moved"' };
      return Response.json(remote);
    }
    if (String(url).includes("/instances?")) return Response.json({ items: [remote] });
    if (String(url).includes("/events?")) return Response.json({ items: [master, remote], nextSyncToken: "cycle-token" });
    return Response.json(remote);
  };
  const deps = { rpc: async (name: string, args: Record<string, unknown>) => { await auth(); return rpc(name, args); }, fetch: http, uuid: randomUUID,
    assertCurrent: async () => {}, exclusive: async <T>(work: () => Promise<T>) => work(), readJournal: async () => journal,
    writeJournal: async (value: unknown) => { journal = value; }, readIntent: () => intent, writeIntent: (value: unknown) => { intent = value; },
    dispatch: async (id: string) => (await runReservedGoogleTaskOutbound(user, id, worker(http))).state };
  for (let i = 0; i < 2; i++) {
    expect((await runGoogleTaskCycle({ userId: user, generation, accessToken: "access" }, deps)).pending).toBe(false);
  }
  expect(writes).toBe(1);
  await db.exec("reset role;"); expect((await db.query("select id from tasks")).rows).toHaveLength(2);
});
async function auth(id = user) { await db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`); }
async function service() { await db.exec("reset role; set role service_role;"); }
async function rpc(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const keys = Object.keys(args);
  return (await db.query<{ result: Record<string, any> }>(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) result`,
    keys.map(k => typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k]))).rows[0].result;
}
const reserve = () => rpc("reserve_google_task_outbound", { p_operation_id: op, p_request: request });
const begin = () => rpc("begin_google_task_outbound", { p_user_id: user, p_operation_id: op, p_dispatch_id: dispatch });
const finish = (outcome = "applied", fields: unknown = local, resource: unknown = applied) => rpc("finish_google_task_outbound",
  { p_user_id: user, p_operation_id: op, p_dispatch_id: dispatch, p_outcome: outcome, p_source: resource, p_fields: fields });
async function start() { await reserve(); await service(); return begin(); }
async function edit(data: unknown, revision = 1) {
  await auth(); return rpc("write_task_revision", { p_task_id: "t", p_expected_revision: revision, p_data: data });
}
async function mapping() { await db.exec("reset role;"); return (await db.query<{ state: string; base: unknown; etag: string }>("select state,base,etag from google_task_mappings")).rows[0]; }
async function conflict(choice: string) {
  await db.exec("reset role;");
  const remote = { ...base, title: "Google" }, observation = { ...source, summary: "Google" };
  await db.query("update google_task_inbound_records set source=$1,decision=$2", [JSON.stringify(observation), JSON.stringify({ kind: "conflict", local, remote, base })]);
  request = { ...request, choice, source: observation, remote };
  await auth();
}

it("reserves idempotently, dispatches only once and settles against desired content", async () => {
  expect((await reserve()).state).toBe("reserved");
  expect((await reserve()).state).toBe("reserved");
  await service(); expect(await begin()).toMatchObject({ send: true, fields: local, remote: base, source });
  expect(await begin()).toMatchObject({ send: false });
  expect(await finish()).toEqual({ finished: true, state: "completed" });
  expect(await finish()).toEqual({ finished: true, state: "completed" });
  expect(await mapping()).toEqual({ state: "active", base: local, etag: '"after"' });
  expect((await db.query("select revision from tasks")).rows).toEqual([{ revision: 1 }]);
  expect((await db.query("select sync_revision,sync_token from google_calendar_connections")).rows).toEqual([{ sync_revision: 1, sync_token: null }]);
});
it("rejects changed request on receipt replay", async () => {
  await reserve(); request = { ...request, choice: "google" };
  await expect(reserve()).rejects.toThrow("OPERATION_ID_REUSED");
});
it.each(["taskRevision", "recordRevision", "syncRevision", "fence"])("checks %s on reservation", async key => {
  request[key] = 99; await expect(reserve()).rejects.toThrow();
  expect((await mapping()).base).toEqual(base);
});
it("does not let one user reserve another user's selection", async () => {
  await auth(other); await expect(reserve()).rejects.toThrow("TASK_SYNC_NOT_ENABLED");
});
it("blocks overlapping reservations even after lease expiry and release", async () => {
  await reserve(); await db.exec("reset role; update google_calendar_connections set lease_until=clock_timestamp()-interval '10 days';");
  await auth(); await rpc("claim_google_task_sync", { p_generation: generation, p_owner: randomUUID() });
  op = randomUUID(); await expect(reserve()).rejects.toThrow("OUTBOUND_PENDING");
});
it("blocks inbound cursor writes and disconnect while a remote result is pending", async () => {
  await reserve();
  await expect(rpc("commit_google_task_inbound", { p_generation: generation, p_calendar_id: "cal", p_sync_revision: 0,
    p_owner: owner, p_fence: 1, p_pass_id: randomUUID(), p_next_sync_token: "next", p_entries: [] })).rejects.toThrow("OUTBOUND_PENDING");
  await db.exec("reset role;");
  await expect(db.exec("delete from google_calendar_connections")).rejects.toThrow("OUTBOUND_PENDING");
  await expect(db.exec("update google_calendar_connections set connection_generation=gen_random_uuid()")).rejects.toThrow("OUTBOUND_PENDING");
});
it("keeps a newer local edit when an older desired value reaches Google", async () => {
  await start(); await edit({ id: "t", ...local, title: "New edit", priority: "high" });
  await service(); await finish();
  expect((await mapping()).base).toEqual(local);
  expect((await db.query("select data->>'title' title,revision from tasks")).rows).toEqual([{ title: "New edit", revision: 2 }]);
});
it.each(["trash", "delete"])("never resurrects a Task after concurrent %s", async mode => {
  await start(); await edit(mode === "delete" ? null : { id: "t", ...local, deletedAt: "2026-09-09" });
  await service(); await finish();
  expect((await mapping()).state).toBe(mode === "delete" ? "deleted" : "trashed");
  expect((await db.query("select * from tasks")).rows).toHaveLength(mode === "delete" ? 0 : 1);
});
it("aborts before sending if Task changed after reservation", async () => {
  await reserve(); await edit({ id: "t", ...local, title: "Changed" });
  await service(); expect(await begin()).toMatchObject({ send: false });
  await db.exec("reset role;");
  expect((await db.query("select state from google_task_outbound_operations")).rows).toEqual([{ state: "aborted" }]);
});
it("keeps uncertainty durable, disallows a late dismissal, and accepts positive reconciliation", async () => {
  await start(); expect(await finish("uncertain", null, null)).toEqual({ finished: false, state: "uncertain" });
  expect(await begin()).toMatchObject({ send: false });
  await expect(finish("rejected", null, null)).rejects.toThrow("OUTBOUND_RECONCILIATION_REQUIRED");
  expect(await finish()).toEqual({ finished: true, state: "completed" });
});
it("a definitive rejection leaves base and conflict record unchanged", async () => {
  await conflict("app"); await start(); await finish("rejected", null, null);
  expect((await mapping()).base).toEqual(base);
  expect((await db.query("select decision->>'kind' kind from google_task_inbound_records")).rows).toEqual([{ kind: "conflict" }]);
});
it.each(["wrong-fields", "wrong-event", "same-etag", "cancelled"])("does not settle %s", async variant => {
  await start();
  await expect(finish("applied", variant === "wrong-fields" ? base : local,
    { ...applied, ...(variant === "wrong-event" ? { id: "other" } : variant === "same-etag" ? { etag: source.etag } : variant === "cancelled" ? { status: "cancelled" } : {}) })).rejects.toThrow("OUTBOUND_RECONCILIATION_REQUIRED");
  expect((await mapping()).base).toEqual(base);
});
it("atomically applies a Google choice, preserving metadata and keeping an immutable receipt of both sides", async () => {
  await conflict("google");
  const result = await reserve(); expect(result.state).toBe("completed");
  expect(result.result.task).toMatchObject({ id: "t", revision: 2, data: { title: "Google", priority: "high", listId: "inbox" } });
  expect(await reserve()).toEqual(result);
  expect((await mapping()).base).toEqual({ ...base, title: "Google" });
  expect((await db.query("select request->'local' local,request->'remote' remote from google_task_outbound_operations")).rows)
    .toEqual([{ local, remote: { ...base, title: "Google" } }]);
});
it("does not use automatic writes to bypass conflict, duplicate mapping, or restore reviews", async () => {
  await conflict("automatic"); await expect(reserve()).rejects.toThrow("CONFLICT_RESOLUTION_REQUIRED");
  await db.exec("reset role; update google_task_inbound_records set decision='{\"kind\":\"review\",\"reason\":\"remote-restored\"}';");
  request.choice = "google"; await auth(); await expect(reserve()).rejects.toThrow("STALE_CONFLICT");
});
it("detects stale displayed values and raw Google source", async () => {
  await conflict("google"); request.local = base; await expect(reserve()).rejects.toThrow("STALE_SELECTION");
  request.local = local; request.source = source; await expect(reserve()).rejects.toThrow("STALE_SELECTION");
});
it("rolls back base update if record CAS fails at settlement", async () => {
  await start(); await db.exec("reset role; update google_task_inbound_records set revision=99;");
  await service(); await expect(finish()).rejects.toThrow("RECORD_CHANGED");
  expect((await mapping()).base).toEqual(base);
});
it("keeps server dispatch/settlement and core bypasses inaccessible to browsers", async () => {
  await reserve(); await expect(begin()).rejects.toThrow("permission denied");
  await expect(finish()).rejects.toThrow("permission denied");
  await expect(db.exec("update google_task_outbound_operations set state='completed'")).rejects.toThrow("permission denied");
  await expect(db.query("select commit_google_task_inbound_review_core($1,'cal',0,$2,1,$3,'next','[]')", [generation, owner, randomUUID()])).rejects.toThrow("permission denied");
  await auth(other); expect((await db.query("select * from google_task_outbound_operations")).rows).toEqual([]);
});
it("excludes OAuth side effects before revocation as well as after it", async () => {
  await reserve(); await service();
  expect(await rpc("begin_google_oauth_operation", { p_operation_id: randomUUID(), p_user_id: other, p_kind: "disconnect" }))
    .toEqual({ acquired: false, uncertain: false });
});
it("refuses new reservations during an existing OAuth operation", async () => {
  await service(); await rpc("begin_google_oauth_operation", { p_operation_id: randomUUID(), p_user_id: other, p_kind: "connect" });
  await auth(); await expect(reserve()).rejects.toThrow("OAUTH_PENDING");
});
it("allows cancellation only before dispatch and preserves all content", async () => {
  await reserve();
  expect(await rpc("cancel_google_task_outbound", { p_operation_id: op })).toBe(true);
  await service(); expect(await begin()).toEqual({ send: false, state: "aborted" });
  expect((await mapping()).base).toEqual(base);
  op = randomUUID(); await auth(); await reserve(); await service(); await begin(); await auth();
  expect(await rpc("cancel_google_task_outbound", { p_operation_id: op })).toBe(false);
});
it("normalizes whitespace titles and line endings consistently with the domain", async () => {
  await db.exec("reset role;");
  expect((await db.query<{ fields: unknown }>("select google_task_shared_fields($1) fields", [JSON.stringify({ ...base, title: "\t\u3000", description: "a\r\nb\rc", startDate: base.dueDate })])).rows[0].fields)
    .toEqual({ ...base, title: "(제목 없음)", description: "a\nb\nc" });
});

function worker(fetchImpl: typeof fetch): GoogleTaskOutboundDeps {
  return { rpc: async (name, args) => { await service(); return rpc(name, args); },
    fetch: fetchImpl, uuid: randomUUID, accessToken: async () => "server-access" };
}
it("runs the server worker through actual reservation, dispatch, conditional PATCH and settlement RPCs", async () => {
  await reserve(); const calls: string[] = [];
  const deps = worker(async (url, init) => {
    expect(String(url)).toBe("https://www.googleapis.com/calendar/v3/calendars/cal/events/e");
    expect(init?.redirect).toBe("error");
    calls.push(init?.method ?? "GET");
    if (init?.method === "PATCH") {
      expect(new Headers(init.headers).get("If-Match")).toBe(source.etag);
      expect(JSON.parse(String(init.body))).toMatchObject({ summary: "App", description: "" });
      await edit({ id: "t", ...local, title: "Typed while sending" });
      return Response.json(applied);
    }
    return Response.json(source);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(calls).toEqual(["GET", "PATCH"]);
  expect((await mapping()).base).toEqual(local);
  expect((await db.query("select data->>'title' title from tasks")).rows).toEqual([{ title: "Typed while sending" }]);
});
it("retries only the lost settlement receipt without a second Google PATCH", async () => {
  await reserve(); let writes = 0, lost = false;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { writes++; return Response.json(applied); }
    return Response.json(source);
  });
  const original = deps.rpc;
  deps.rpc = async (name, args) => {
    const result = await original(name, args);
    if (name === "finish_google_task_outbound" && !lost) { lost = true; throw Error("response lost"); }
    return result;
  };
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(writes).toBe(1);
});
it("does not redispatch after a lost begin response", async () => {
  await reserve(); let calls = 0;
  const deps = worker(async () => { calls++; return Response.json(source); });
  const original = deps.rpc;
  deps.rpc = async (name, args) => { await original(name, args); throw Error("lost begin"); };
  await expect(runReservedGoogleTaskOutbound(user, op, deps)).rejects.toThrow();
  deps.rpc = original;
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(calls).toBe(1); // Recovery GET only; its unchanged content cannot release the operation.
});
it.each(["network", "500", "different-content", "same-etag"])("retains uncertain %s without automatic remote retry", async variant => {
  await reserve(); let writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method !== "PATCH") return Response.json(source);
    writes++;
    if (variant === "network") throw Error("lost response");
    if (variant === "500") return new Response("bad", { status: 500 });
    return Response.json(variant === "same-etag" ? { ...applied, etag: source.etag } : source);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(writes).toBe(1); expect((await mapping()).base).toEqual(base);
});
it("aborts a stale GET without sending and leaves the conflict available for refresh", async () => {
  await conflict("app"); await reserve(); let reads = 0;
  const deps = worker(async (_url, init) => { expect(init?.method).not.toBe("PATCH"); reads++; return Response.json({ ...source, etag: "changed" }); });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "aborted" });
  expect(reads).toBe(1); expect((await mapping()).base).toEqual(base);
});
it("handles a 412 as rejection without a timestamp-based retry", async () => {
  await reserve(); let writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { writes++; return new Response(null, { status: 412 }); }
    return Response.json(source);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "aborted" });
  expect(writes).toBe(1); expect((await mapping()).base).toEqual(base);
});
it("reconciles a lost successful PATCH through GET and never sends it again", async () => {
  await reserve(); let remote = source, writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { writes++; remote = applied; throw Error("success response lost"); }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(writes).toBe(1); expect((await mapping()).base).toEqual(local);
});

async function reserveEvent(kind: "create" | "delete") {
  if (kind === "create") {
    await db.exec("reset role; delete from google_task_mappings; delete from google_task_inbound_records;"); await auth();
  } else {
    await edit({ id: "t", ...local, deletedAt: "2026-09-09" }); request.taskRevision = 2;
  }
  return rpc("reserve_google_task_event", { p_operation_id: op, p_request: { ...request, kind } });
}
it("creates a server-ID event once and recovers a lost insert response through its private marker", async () => {
  await reserveEvent("create"); let remote: unknown = null, posts = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "POST") {
      posts++; const body = JSON.parse(String(init.body)); expect(body.id).toMatch(/^ff[0-9a-f]{32}$/);
      remote = { ...body, etag: '"created"' }; throw Error("lost insert response");
    }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(posts).toBe(1); expect((await mapping()).base).toEqual(local);
});
it("does not claim a colliding event without the operation marker", async () => {
  await reserveEvent("create"); let id = "";
  const deps = worker(async (_url, init) => {
    if (init?.method === "POST") { id = JSON.parse(String(init.body)).id; return new Response(null, { status: 409 }); }
    return Response.json({ ...applied, id });
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  await db.exec("reset role;"); expect((await db.query("select * from google_task_mappings")).rows).toHaveLength(0);
});
it("preserves a concurrent permanent deletion while a new event is being created", async () => {
  await reserveEvent("create");
  const deps = worker(async (_url, init) => {
    const body = JSON.parse(String(init?.body)); await edit(null);
    return Response.json({ ...body, etag: '"new"' });
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect((await mapping()).state).toBe("deleted");
});
it("conditionally deletes the mapped event and keeps the Task in trash", async () => {
  await reserveEvent("delete"); let deletes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "DELETE") { deletes++; expect(new Headers(init.headers).get("If-Match")).toBe(source.etag); return new Response(null, { status: 204 }); }
    return Response.json(source);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(deletes).toBe(1); expect((await mapping()).state).toBe("trashed");
  expect((await db.query("select remote_deleted from google_task_mappings")).rows).toEqual([{ remote_deleted: true }]);
});
it("recovers an uncertain delete without another DELETE or Task deletion", async () => {
  await reserveEvent("delete"); let removed = false, deletes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "DELETE") { deletes++; removed = true; throw Error("lost deletion response"); }
    return removed ? new Response(null, { status: 410 }) : Response.json(source);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(deletes).toBe(1); await mapping(); expect((await db.query("select * from tasks")).rows).toHaveLength(1);
});
it("stops an unsent delete after the Task is restored", async () => {
  await reserveEvent("delete"); await edit({ id: "t", ...local }, 2);
  let calls = 0; const deps = worker(async () => { calls++; return Response.json(source); });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "aborted" }); expect(calls).toBe(0);
});
async function reviewFixture() {
  await db.exec(`reset role; delete from google_task_mappings;
    insert into lists(id,user_id,data) values('inbox','${user}','{"kind":"inbox"}') on conflict do nothing;
    update google_task_inbound_records set decision='{"kind":"review","reason":"duplicate-candidate","taskIds":["t"]}';`);
  await auth(); request = { ...request, choice: "exclude", fields: base };
}
const resolveReview = () => rpc("resolve_google_task_review", { p_operation_id: op, p_request: request });
it("excludes a duplicate and later imports it exactly once as a separate Inbox task", async () => {
  await reviewFixture(); await resolveReview(); expect((await resolveReview()).decision).toEqual({ kind: "skip", reason: "excluded" });
  op = randomUUID(); request = { ...request, choice: "import", syncRevision: 1, recordRevision: 2 };
  await resolveReview(); await resolveReview(); await db.exec("reset role;");
  const rows = (await db.query<{ data: { id: string; listId: string } }>("select data from tasks where id<>'t'")).rows;
  expect(rows).toHaveLength(1); expect(rows[0].data.listId).toBe("inbox");
});
it("rejects stale review and unsupported recurrence before any Task creation", async () => {
  await reviewFixture(); request.recordRevision = 99; await expect(resolveReview()).rejects.toThrow("STALE_SELECTION");
  request.recordRevision = 1; request.choice = "import";
  const recurring = { ...source, recurrence: ["RRULE:FREQ=DAILY"] }; request.source = recurring;
  await db.exec("reset role;"); await db.query("update google_task_inbound_records set source=$1", [JSON.stringify(recurring)]); await auth();
  await expect(resolveReview()).rejects.toThrow("UNSUPPORTED_EVENT");
});
it("restores a trashed mapped Task without hiding different app and Google content", async () => {
  await edit({ id: "t", ...local, deletedAt: "2026-09-09" });
  await db.exec("reset role; update google_task_mappings set source='{\"id\":\"e\",\"status\":\"cancelled\"}'; update google_task_inbound_records set decision='{\"kind\":\"review\",\"reason\":\"remote-restored\",\"taskIds\":[\"t\"]}';");
  await auth(); request = { ...request, choice: "restore", taskRevision: 2, fields: base };
  expect((await resolveReview()).decision).toMatchObject({ kind: "conflict", local, remote: base });
  expect((await mapping()).state).toBe("active");
  expect((await db.query("select remote_deleted from google_task_mappings")).rows).toEqual([{ remote_deleted: false }]);
  expect((await db.query("select data->>'deletedAt' deleted from tasks")).rows).toEqual([{ deleted: null }]);
});
it("runs the full client coordinator against SQL and the server worker", async () => {
  await db.exec(`reset role; insert into lists(id,user_id,data) values('inbox','${user}','{"kind":"inbox"}') on conflict do nothing;`);
  await auth(); await rpc("release_google_task_sync", { p_generation: generation, p_owner: owner, p_fence: 1 });
  let journal: unknown = null, intent: unknown = null, remote: unknown = source;
  const http: typeof fetch = async (url, init) => {
    if (init?.method === "PATCH") { remote = applied; return Response.json(applied); }
    return String(url).includes("events?") ? Response.json({ items: [remote], nextSyncToken: "cycle-token" }) : Response.json(remote);
  };
  const result = await runGoogleTaskCycle({ userId: user, generation, accessToken: "client-read" }, {
    rpc: async (name, args) => { await auth(); return rpc(name, args); }, fetch: http, uuid: randomUUID,
    assertCurrent: async () => {}, exclusive: async work => work(), readJournal: async () => journal, writeJournal: async value => { journal = value; },
    readIntent: () => intent, writeIntent: value => { intent = value; },
    dispatch: async id => (await runReservedGoogleTaskOutbound(user, id, worker(http))).state,
  });
  expect(result.pending).toBe(false); expect(journal).toBeNull(); expect(intent).toBeNull();
  expect((await mapping()).base).toEqual(local);
});

it("blocks old clients from claiming a lease in a timezone different from the account", async () => {
  await db.exec("reset role; update settings set data='{\"appSettings\":{\"timezone\":\"Asia/Shanghai\"}}'; update google_calendar_connections set lease_owner=null,lease_until=null");
  await auth();
  await expect(rpc("claim_google_task_sync", { p_generation: generation, p_owner: owner })).rejects.toThrow("ACCOUNT_TIMEZONE_PENDING");
  expect(await rpc("apply_google_account_timezone", { p_generation: generation, p_expected_timezone: "UTC" })).toMatchObject({ applied: false });
  await db.exec("reset role");
  expect((await db.query("select sync_timezone from google_calendar_connections")).rows).toEqual([{ sync_timezone: "Asia/Seoul" }]);
});

it("automatically merges both sides through the coordinator and recovers a lost Google response", async () => {
  await db.exec(`reset role; insert into lists(id,user_id,data) values('inbox','${user}','{"kind":"inbox"}') on conflict do nothing;`);
  await auth(); await rpc("release_google_task_sync", { p_generation: generation, p_owner: owner, p_fence: 1 });
  let journal: unknown = null, intent: unknown = null, writes = 0;
  let remote: Record<string, unknown> = { ...source, description: "Google notes", etag: '"remote-edited"' };
  const http: typeof fetch = async (url, init) => {
    if (init?.method === "PATCH") {
      writes++;
      remote = JSON.parse(JSON.stringify({ ...remote, ...JSON.parse(String(init.body)), etag: '"merged"' }), (_k, v) => v === null ? undefined : v);
      throw Error("lost response");
    }
    return String(url).includes("events?") ? Response.json({ items: [remote], nextSyncToken: "automatic-token" }) : Response.json(remote);
  };
  const deps = {
    rpc: async (name: string, args: Record<string, unknown>) => { await auth(); return rpc(name, args); }, fetch: http, uuid: randomUUID,
    assertCurrent: async () => {}, exclusive: async <T,>(work: () => Promise<T>) => work(), readJournal: async () => journal, writeJournal: async (value: unknown) => { journal = value; },
    readIntent: () => intent, writeIntent: (value: unknown) => { intent = value; },
    dispatch: async (id: string) => (await runReservedGoogleTaskOutbound(user, id, worker(http))).state,
  };
  expect((await runGoogleTaskCycle({ userId: user, generation, accessToken: "read", expectedTimezone: "Asia/Seoul" }, deps)).pending).toBe(true);
  const result = await runGoogleTaskCycle({ userId: user, generation, accessToken: "read", expectedTimezone: "Asia/Seoul" }, deps);
  expect(result.pending).toBe(false); expect(writes).toBe(1);
  expect((await mapping()).base).toEqual({ ...local, description: "Google notes" });
  expect(result.snapshot.records[0].decision.kind).toBe("acknowledge");
});
it("uses a new etag as proof to release a lost patch whose remote content changed again", async () => {
  await reserve(); let remote = source;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { remote = { ...source, summary: "Edited later in Google", etag: '"newer"' }; throw Error("lost"); }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "aborted" });
  expect((await mapping()).base).toEqual(base);
});
it("maps an owned created event changed before recovery without guessing a base", async () => {
  await reserveEvent("create"); let remote: unknown;
  const deps = worker(async (_url, init) => {
    if (init?.method === "POST") { remote = { ...JSON.parse(String(init.body)), summary: "Changed before recovery", etag: '"later"' }; throw Error("lost"); }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect((await mapping()).base).toBeNull();
  expect((await db.query("select decision->>'kind' kind from google_task_inbound_records")).rows).toEqual([{ kind: "conflict" }]);
});
it("requires DB-owner authority and evidence for manual no-write recovery", async () => {
  await start(); await finish("uncertain", null, null);
  await expect(rpc("recover_google_task_no_write", { p_user_id: user, p_operation_id: op, p_evidence: "invocation stopped, provider rejected" })).rejects.toThrow("permission denied");
  await db.exec("reset role;");
  await expect(rpc("recover_google_task_no_write", { p_user_id: user, p_operation_id: op, p_evidence: "" })).rejects.toThrow("RECOVERY_EVIDENCE_REQUIRED");
  await rpc("recover_google_task_no_write", { p_user_id: user, p_operation_id: op, p_evidence: "request stopped; no write confirmed at provider; ticket 12" });
  expect((await db.query("select previous_state from google_task_recovery_audit where operation_id=$1", [op])).rows).toEqual([{ previous_state: "uncertain" }]);
  expect((await mapping()).base).toEqual(base);
});
it("does not permit a second device's pass to take over an active lease", async () => {
  const secondOwner = randomUUID();
  await expect(rpc("claim_google_task_sync", { p_generation: generation, p_owner: secondOwner })).rejects.toThrow("SYNC_BUSY");
  await rpc("release_google_task_sync", { p_generation: generation, p_owner: owner, p_fence: 1 });
  const lease = await rpc("claim_google_task_sync", { p_generation: generation, p_owner: secondOwner });
  expect(lease.fence).toBe(2);
  await expect(reserve()).rejects.toThrow("SYNC_PRECONDITION_FAILED");
});

async function repeatReservation() {
  await edit({ id: "t", ...base, repeatType: "weekly", repeatDays: [1, 3] });
  await db.exec("reset role; update google_task_inbound_records set decision='{\"kind\":\"acknowledge\"}';");
  await auth(); request = { ...request, taskRevision: 2, choice: "recurrence" };
  return rpc("reserve_google_task_recurrence", { p_operation_id: op, p_request: request });
}
it("writes only the explicitly selected recurrence and recovers a lost response without another PATCH", async () => {
  await repeatReservation(); let remote: Record<string, unknown> = source, writes = 0;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") {
      writes++; const body = JSON.parse(String(init.body));
      expect(body.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]);
      expect(body).not.toHaveProperty("summary"); expect(body).not.toHaveProperty("description");
      remote = { ...source, recurrence: body.recurrence, etag: '"recurrence-written"' }; throw Error("reply lost");
    }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "completed" });
  expect(writes).toBe(1); expect((await mapping()).base).toEqual(base);
});
it("blocks recurrence selection until a shared-content conflict is resolved", async () => {
  await conflict("app"); request.choice = "recurrence";
  await expect(rpc("reserve_google_task_recurrence", { p_operation_id: op, p_request: request })).rejects.toThrow("CONFLICT_RESOLUTION_REQUIRED");
});
it("does not apply an old recurrence selection after the task changes", async () => {
  await repeatReservation(); await edit({ id: "t", ...base, repeatType: "yearly" }, 2);
  let calls = 0;
  expect(await runReservedGoogleTaskOutbound(user, op, worker(async () => { calls++; return Response.json(source); }))).toEqual({ state: "aborted" });
  expect(calls).toBe(0);
});
it("does not agree to a different remote rule after a lost recurrence write", async () => {
  await repeatReservation(); let remote: Record<string, unknown> = source;
  const deps = worker(async (_url, init) => {
    if (init?.method === "PATCH") { remote = { ...source, recurrence: ["RRULE:FREQ=YEARLY"], etag: '"later-rule"' }; throw Error("lost"); }
    return Response.json(remote);
  });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "pending" });
  expect(await runReservedGoogleTaskOutbound(user, op, deps)).toEqual({ state: "aborted" });
});
it("creates an app repeating task with server-captured repeat settings", async () => {
  await edit({ id: "t", ...local, repeatType: "daily" }); request.taskRevision = 2;
  await reserveEvent("create"); let writes = 0;
  const result = await runReservedGoogleTaskOutbound(user, op, worker(async (_url, init) => {
    writes++; const body = JSON.parse(String(init?.body)); expect(body.recurrence).toEqual(["RRULE:FREQ=DAILY"]);
    return Response.json({ ...body, etag: '"created-repeat"' });
  }));
  expect(result.state).toBe("completed"); expect(writes).toBe(1);
});
it("requires explicit selection to copy a historical task, preserving its old mapping", async () => {
  const old = randomUUID(); await db.exec("reset role;");
  await db.query("update google_task_mappings set generation=$1", [old]); await auth();
  const body = { ...request, kind: "create" };
  await expect(rpc("reserve_google_task_event", { p_operation_id: op, p_request: body })).rejects.toThrow("MAPPING_REVIEW_REQUIRED");
  expect(await rpc("reserve_google_task_event", { p_operation_id: op, p_request: { ...body, choice: "transfer" } })).toMatchObject({ state: "reserved" });
  await runReservedGoogleTaskOutbound(user, op, worker(async (_url, init) => Response.json({ ...JSON.parse(String(init?.body)), etag: '"copy"' })));
  await db.exec("reset role;");
  const rows = (await db.query<{ generation: string; event_id: string }>("select generation,event_id from google_task_mappings")).rows;
  expect(rows).toContainEqual({ generation: old, event_id: "e" });
  expect(rows.find(r=>r.generation===generation)?.event_id).toMatch(/^ff[0-9a-f]{32}$/);
  await auth(); op = randomUUID();
  const newer = { ...body, choice: "transfer", syncRevision: 1 };
  await expect(rpc("reserve_google_task_event", { p_operation_id: op, p_request: newer })).rejects.toThrow("MAPPING_REVIEW_REQUIRED");
});
it("never treats an unverified legacy ID as transfer authorization", async () => {
  await db.exec("reset role; delete from google_task_mappings;");
  await edit({ id: "t", ...local, googleEventId: "unverified" });
  await expect(rpc("reserve_google_task_event", { p_operation_id: op, p_request: { ...request, kind: "create", choice: "transfer", taskRevision: 2 } })).rejects.toThrow("HISTORY_REQUIRED");
});
it("compacts resolved comparison copies after 30 days while keeping exact request and settlement replay", async () => {
  await start(); await finish(); await db.exec("reset role;");
  await db.exec("update google_task_outbound_operations set resolved_at=clock_timestamp()-interval '31 days'; update google_task_inbound_records set resolved_at=clock_timestamp()-interval '31 days';");
  await service(); expect(await rpc("prune_google_task_history", { p_user_id: user })).toBe(1);
  await auth(); expect(await reserve()).toMatchObject({ state: "completed" });
  request = { ...request, taskRevision: 900 };
  await expect(reserve()).rejects.toThrow("OPERATION_ID_REUSED");
  await service(); expect(await finish()).toEqual({ finished: true, state: "completed" });
  await expect(finish("applied", { ...local, title: "different" })).rejects.toThrow("RESULT_CHANGED");
  await db.exec("reset role;");
  const stored = (await db.query<{ request: unknown; result: unknown; desired: unknown }>("select request,result,desired from google_task_outbound_operations")).rows[0];
  expect(JSON.stringify(stored)).not.toContain('"App"'); expect(stored.desired).toEqual({});
  expect((await mapping()).base).toEqual(local);
});
it("preserves unresolved and recently resolved comparison evidence regardless of request age", async () => {
  await start(); await finish("uncertain", null, null);
  await db.exec("reset role; update google_task_outbound_operations set created_at=clock_timestamp()-interval '90 days';");
  await service(); expect(await rpc("prune_google_task_history", { p_user_id: user })).toBe(0);
  await finish();
  expect(await rpc("prune_google_task_history", { p_user_id: user })).toBe(0);
  await auth(); await expect(rpc("prune_google_task_history", { p_user_id: other })).rejects.toThrow("permission denied");
});
it("replays a compacted review receipt without creating another Task", async () => {
  await reviewFixture(); request.choice = "import"; await resolveReview();
  await db.exec("reset role; update google_task_inbound_records set resolved_at=clock_timestamp()-interval '31 days';");
  await db.query("update google_task_review_receipts set created_at=clock_timestamp()-interval '31 days' where operation_id=$1", [op]);
  await service(); expect(await rpc("prune_google_task_history", { p_user_id: user })).toBe(1);
  await auth(); expect(await resolveReview()).toMatchObject({ historyCompacted: true, syncRevision: 1 });
  request.choice = "exclude"; await expect(resolveReview()).rejects.toThrow("OPERATION_ID_REUSED");
  await db.exec("reset role;"); expect((await db.query("select id from tasks")).rows).toHaveLength(2);
});
it("replays a compacted inbound pass by its fingerprint and keeps its cursor receipt", async () => {
  const pass = randomUUID();
  const args = { p_generation: generation, p_calendar_id: "cal", p_sync_revision: 0, p_owner: owner, p_fence: 1,
    p_pass_id: pass, p_next_sync_token: "retention-token", p_entries: [] };
  await rpc("commit_google_task_inbound", args);
  await db.exec("reset role; update google_task_inbound_passes set created_at=clock_timestamp()-interval '31 days';");
  await service(); expect(await rpc("prune_google_task_history", { p_user_id: user })).toBe(1);
  await auth(); expect(await rpc("commit_google_task_inbound", args)).toMatchObject({ syncRevision: 1, syncToken: "retention-token", historyCompacted: true, tasks: [] });
  await expect(rpc("commit_google_task_inbound", { ...args, p_next_sync_token: "changed" })).rejects.toThrow("PASS_ID_REUSED");
});
