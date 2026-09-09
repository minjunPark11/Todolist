import { describe, expect, it } from "vitest";
import { inspectTaskOutboundResult, planTaskConflictResolution, planTaskOutbound, toTaskSharedPatch, type TaskConflictSelection, type TaskOutboundInput } from "./taskOutboundPlan";
import { toTaskInboundFields, type TaskInboundFields } from "./taskInboundShape";

const base: TaskInboundFields = { title: "Work", description: "Notes", startDate: "", dueDate: "2026-09-08", startTime: "", endTime: "" };
function fixture(): TaskOutboundInput {
  return { scope: { userId: "u", connectionGeneration: "g", calendarId: "c", syncRevision: 4 }, timezone: "Asia/Seoul",
    snapshot: { eventId: "e", taskId: "t", revision: 3, state: "active", base: { ...base }, fields: { ...base, title: "App" }, etag: "old" },
    source: { id: "e", etag: '"fresh"', summary: "Work", description: "Notes", start: { date: "2026-09-08" }, end: { date: "2026-09-09" } } };
}
function conflict() {
  const input = fixture();
  input.source!.summary = "Google";
  const selection: TaskConflictSelection = { scope: { ...input.scope }, taskId: "t", eventId: "e", taskRevision: 3,
    recordRevision: 5, etag: '"fresh"', local: { ...input.snapshot.fields }, remote: { ...base, title: "Google" }, choice: "app" };
  return { input, selection, record: { revision: 5, kind: "conflict" } };
}

describe("mapped outbound base comparison", () => {
  it("uses freshly read etag and copies only shared fields, never advancing base in the plan", () => {
    const input = fixture();
    const plan = planTaskOutbound(input);
    expect(plan).toMatchObject({ scope: input.scope, expected: { taskId: "t", revision: 3, eventId: "e" },
      action: { kind: "patch", ifMatch: '"fresh"', fields: input.snapshot.fields } });
    if (plan.action.kind !== "patch") throw Error("Expected patch");
    expect(Object.keys(plan.action.body).sort()).toEqual(["description", "end", "start", "summary"]);
    expect(input.snapshot.base).toEqual(base);
  });
  it("acknowledges convergence without a legacy base", () => {
    const input = fixture(); input.snapshot.base = undefined; input.source!.summary = "App";
    expect(planTaskOutbound(input).action).toMatchObject({ kind: "acknowledge", base: input.snapshot.fields, etag: '"fresh"' });
  });
  it("routes a remote-only change back through inbound", () => {
    const input = fixture(); input.snapshot.fields = { ...base }; input.source!.summary = "Remote";
    expect(planTaskOutbound(input).action.kind).toBe("inbound-required");
  });
  it.each(["1900-01-01", "2099-01-01"])("preserves both edits regardless of updated %s", updated => {
    const { input } = conflict(); input.source!.updated = updated;
    expect(planTaskOutbound(input).action).toMatchObject({ kind: "conflict", local: { title: "App" }, remote: { title: "Google" }, base });
  });
  it("does not infer a base from an etag or overwrite without a base", () => {
    const input = fixture(); input.snapshot.base = undefined; input.snapshot.etag = '"fresh"';
    expect(planTaskOutbound(input).action.kind).toBe("conflict");
  });
  it.each([null, { id: "other" }, { id: "e" }])("holds unavailable/mismatched/incomplete observations %j", source => {
    expect(planTaskOutbound({ ...fixture(), source }).action.kind).toBe("hold");
  });
  it.each(["trashed", "deleted"] as const)("does not turn %s into remote delete/recreate", state => {
    const input = fixture(); input.snapshot.state = state;
    expect(planTaskOutbound(input).action.kind).toBe("hold");
  });
  it("does not bypass persisted review even if current values match", () => {
    const input = fixture(); input.held = true; input.source!.summary = "App";
    expect(planTaskOutbound(input).action).toEqual({ kind: "hold", reason: "resolution-required" });
  });
  it("distinguishes cancelled originals from cancelled instances", () => {
    const input = fixture(); input.source!.status = "cancelled";
    expect(planTaskOutbound(input).action.kind).toBe("inbound-required");
    input.source!.originalStartTime = { date: "2026-09-08" };
    expect(planTaskOutbound(input).action).toEqual({ kind: "hold", reason: "recurring-instance" });
  });
  it("patches shared fields on an existing master without changing its recurrence", () => {
    const input = fixture(); input.source!.recurrence = ["RRULE:FREQ=DAILY"];
    const plan = planTaskOutbound(input); expect(plan.action.kind).toBe("patch");
    if (plan.action.kind === "patch") expect(plan.action.body).not.toHaveProperty("recurrence");
    input.source!.recurrence = "bad";
    expect(planTaskOutbound(input).action).toEqual({ kind: "hold", reason: "invalid-event" });
  });
  it.each(["", "*", undefined])("requires a specific etag: %s", etag => {
    const input = fixture(); input.source!.etag = etag;
    expect(planTaskOutbound(input).action).toEqual({ kind: "hold", reason: "etag-required" });
  });
});

describe("lossless outbound shared schedule", () => {
  it("clears obsolete timed properties and makes range end exclusive across a year boundary", () => {
    expect(toTaskSharedPatch({ ...base, startDate: "2026-12-30", dueDate: "2026-12-31", description: "" }, "Asia/Seoul"))
      .toEqual({ summary: "Work", description: "", start: { date: "2026-12-30", dateTime: null, timeZone: null },
        end: { date: "2027-01-01", dateTime: null, timeZone: null } });
  });
  it.each(["Asia/Seoul", "America/New_York", "Australia/Lord_Howe"])("round-trips explicit instants through %s", timezone => {
    const fields = { ...base, startTime: "09:00", endTime: "10:00" };
    const patch = toTaskSharedPatch(fields, timezone)!;
    expect(patch.start.date).toBeNull();
    expect(toTaskInboundFields({ summary: patch.summary, description: patch.description,
      start: { dateTime: patch.start.dateTime }, end: { dateTime: patch.end.dateTime } }, timezone)).toEqual({ ok: true, fields });
  });
  it.each([
    { dueDate: "2026-02-30" }, { dueDate: "" }, { startDate: "2026-09-09" },
    { startTime: "09:00" }, { endTime: "10:00" }, { startTime: "24:00", endTime: "25:00" },
    { startTime: "10:00", endTime: "09:00" }, { startTime: "10:00", endTime: "10:00" },
    { startDate: "2026-09-07", startTime: "09:00", endTime: "10:00" },
  ])("rejects rather than silently correcting %j", change => {
    expect(toTaskSharedPatch({ ...base, ...change }, "Asia/Seoul")).toBeNull();
  });
  it.each([
    ["2026-03-08", "02:15", "03:15", "America/New_York"],
    ["2026-11-01", "01:15", "02:15", "America/New_York"],
    ["2026-04-05", "01:45", "02:45", "Australia/Lord_Howe"],
    ["2026-10-04", "02:15", "03:15", "Australia/Lord_Howe"],
  ])("rejects DST gaps/folds %s %s %s %s", (dueDate, startTime, endTime, timezone) => {
    expect(toTaskSharedPatch({ ...base, dueDate, startTime, endTime }, timezone)).toBeNull();
  });
  it("rejects invalid zones for all-day as well", () => expect(toTaskSharedPatch(base, "bad/zone")).toBeNull());
});

describe("explicit conflict choice", () => {
  it("app choice proposes an exact-etag patch without advancing base", () => {
    const { input, record, selection } = conflict();
    const plan = planTaskConflictResolution(input, record, selection);
    expect(plan).toMatchObject({ kind: "accept-app", expected: selection, fields: selection.local, ifMatch: selection.etag });
    expect(input.snapshot.base).toEqual(base);
    selection.local.title = "Later UI edit";
    if (plan.kind !== "accept-app") throw Error("Expected app choice");
    expect(plan.expected.local.title).toBe("App");
  });
  it("Google choice proposes only shared fields and retains the losing content in the receipt intent", () => {
    const { input, record, selection } = conflict(); selection.choice = "google";
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "accept-google", expected: selection, fields: selection.remote });
  });
  it.each(["userId", "connectionGeneration", "calendarId"] as const)("rejects changed %s", key => {
    const { input, record, selection } = conflict(); selection.scope[key] = "different";
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "hold", reason: "stale-selection" });
  });
  it.each(["taskRevision", "recordRevision"] as const)("rejects changed %s", key => {
    const { input, record, selection } = conflict(); selection[key]++;
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "hold", reason: "stale-selection" });
  });
  it("rejects changed remote etag even if content has not changed", () => {
    const { input, record, selection } = conflict(); input.source!.etag = '"new"';
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "hold", reason: "stale-selection" });
  });
  it.each(["local", "remote"] as const)("rejects changed displayed %s content even under the same revision", key => {
    const { input, record, selection } = conflict(); selection[key].title = "Other";
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "hold", reason: "stale-selection" });
  });
  it("cannot use a content choice to resolve mapping or restore reviews", () => {
    const { input, record, selection } = conflict(); record.kind = "review";
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "hold", reason: "different-review-required" });
  });
  it("does not let an app choice resurrect a cancelled event", () => {
    const { input, record, selection } = conflict(); input.source!.status = "cancelled";
    expect(planTaskConflictResolution(input, record, selection)).toEqual({ kind: "hold", reason: "refresh-required" });
  });
});

describe("outbound response reconciliation", () => {
  it("accepts a lost-response reconciliation GET only when desired content actually matches", () => {
    const input = fixture(); input.source!.summary = "App";
    expect(inspectTaskOutboundResult({ eventId: "e", fields: input.snapshot.fields, timezone: input.timezone }, input.source))
      .toEqual({ kind: "agree", base: input.snapshot.fields, etag: '"fresh"' });
  });
  it.each([null, { id: "other" }, { id: "e", etag: "new", status: "cancelled" }])("keeps uncertain result %j unresolved", source => {
    expect(inspectTaskOutboundResult({ eventId: "e", fields: base, timezone: "Asia/Seoul" }, source)).toEqual({ kind: "reconcile-required" });
  });
  it("does not acknowledge a successful-looking response carrying different content", () => {
    const input = fixture();
    expect(inspectTaskOutboundResult({ eventId: "e", fields: input.snapshot.fields, timezone: input.timezone }, input.source))
      .toEqual({ kind: "reconcile-required" });
  });
  it("does not acknowledge a newly recurring original under an old one-off intent", () => {
    const input = fixture(); input.source!.recurrence = ["RRULE:FREQ=DAILY"];
    expect(inspectTaskOutboundResult({ eventId: "e", fields: base, timezone: input.timezone }, input.source)).toEqual({ kind: "reconcile-required" });
  });
});
