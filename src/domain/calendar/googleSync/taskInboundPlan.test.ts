import { describe, expect, it } from "vitest";
import { planTaskInbound, type TaskInboundInput, type TaskInboundSnapshot } from "./taskInboundPlan";
import { toTaskInboundFields, type TaskInboundFields } from "./taskInboundShape";
import type { GoogleEventResource } from "./inboundShape";
import { toGoogleEventBody } from "./eventShape";

const fields: TaskInboundFields = { title: "Work", description: "Notes", dueDate: "2026-09-08", startDate: "", startTime: "", endTime: "" };
const event: GoogleEventResource = { id: "e1", etag: "v1", summary: "Work", description: "Notes", start: { date: "2026-09-08" }, end: { date: "2026-09-09" } };
const held: TaskInboundSnapshot = { eventId: "e1", taskId: "t1", revision: 7, state: "active", fields, base: fields, etag: "v1" };
const input: TaskInboundInput = { scope: { userId: "u", connectionGeneration: "g", calendarId: "c", syncRevision: 2 }, items: [event], snapshots: [], inboxListId: "inbox", timezone: "Asia/Seoul" };
function run(items: GoogleEventResource[] = [event], snapshots: TaskInboundSnapshot[] = [held]) {
  const plan = planTaskInbound({ ...input, items, snapshots });
  expect(plan.ok).toBe(true);
  return plan.entries;
}

describe("task inbound content decisions", () => {
  it("creates an Inbox plan with only shared fields and raw source; assigns no device-generated task ID", () => {
    expect(run([event], [])[0]).toEqual({ eventId: "e1", source: event, expected: [], decision: { kind: "create", listId: "inbox", fields } });
  });
  it("acknowledges equal content even without a legacy base", () => {
    expect(run([event], [{ ...held, base: undefined }])[0].decision).toEqual({ kind: "acknowledge", base: fields });
  });
  it("updates remote-only changes and carries the server revision precondition", () => {
    const entry = run([{ ...event, summary: "Remote" }])[0];
    expect(entry.expected).toEqual([{ taskId: "t1", revision: 7 }]);
    expect(entry.decision).toEqual({ kind: "update", fields: { ...fields, title: "Remote" } });
  });
  it("preserves local dirty content even when the etag is an echo", () => {
    expect(run([event], [{ ...held, fields: { ...fields, title: "Local" } }])[0].decision).toEqual({ kind: "keep-local" });
  });
  it.each(["1900-01-01T00:00:00Z", "2099-01-01T00:00:00Z"])("never uses remote updated %s to select a conflict winner", (updated) => {
    const local = { ...fields, title: "Local" };
    const remote = { ...fields, description: "Remote" };
    expect(run([{ ...event, description: "Remote", updated }], [{ ...held, fields: local }])[0].decision)
      .toEqual({ kind: "conflict", local, remote, base: fields });
  });
  it("preserves both sides when a legacy mapping has no base", () => {
    expect(run([{ ...event, summary: "Different" }], [{ ...held, base: undefined }])[0].decision.kind).toBe("conflict");
  });
  it("acknowledges convergent edits and normalizes only line endings", () => {
    expect(run([{ ...event, description: "a\r\nb #tag" }], [{ ...held, fields: { ...fields, description: "a\nb #tag" } }])[0].decision.kind).toBe("acknowledge");
    expect(run([{ ...event, description: " Notes " }])[0].decision.kind).toBe("update");
  });
  it("preserves blank title source alongside the display fallback", () => {
    const entry = run([{ ...event, summary: "  " }], [])[0];
    expect(entry.source.summary).toBe("  ");
    expect(entry.decision).toMatchObject({ kind: "create", fields: { title: "(제목 없음)" } });
  });
});

describe("identity, recurrence and deletion", () => {
  it("does not infer deletion from absence", () => expect(run([])).toEqual([]));
  it("deduplicates identical resources, but rejects inconsistent pages atomically", () => {
    expect(run([event, event])).toHaveLength(1);
    expect(planTaskInbound({ ...input, items: [event, { ...event, summary: "New" }] }))
      .toEqual({ ok: false, reason: "inconsistent-event-page", entries: [] });
  });
  it("fails the whole plan on an unidentifiable item", () => {
    expect(planTaskInbound({ ...input, items: [event, {}] })).toEqual({ ok: false, reason: "missing-event-id", entries: [] });
  });
  it("makes same-title/time a review candidate instead of silently discarding it", () => {
    expect(run([{ ...event, id: "other" }])[0].decision).toEqual({ kind: "review", reason: "duplicate-candidate", taskIds: ["t1"] });
  });
  it("does not merge two unknown events with the same content", () => {
    expect(run([event, { ...event, id: "other" }], []).map((e) => e.decision.kind)).toEqual(["create", "create"]);
  });
  it("blocks ambiguous existing mappings", () => {
    expect(run([event], [held, { ...held, taskId: "t2" }])[0].decision).toMatchObject({ kind: "review", reason: "ambiguous-mapping" });
  });
  it("records explicit user exclusions", () => {
    expect(planTaskInbound({ ...input, excludedEventIds: new Set(["e1"]) }).entries[0].decision).toEqual({ kind: "skip", reason: "excluded" });
  });
  it("trashes on explicit cancellation despite unsent local edits without patching their contents", () => {
    expect(run([{ id: "e1", status: "cancelled" }], [{ ...held, fields: { ...fields, title: "Unsent" } }])[0].decision).toEqual({ kind: "trash" });
  });
  it("does not create a task from unknown cancellation", () => {
    expect(run([{ id: "unknown", status: "cancelled" }])[0].decision).toEqual({ kind: "skip", reason: "cancelled-unmapped" });
  });
  it.each(["trashed", "deleted"] as const)("does not resurrect a %s task", (state) => {
    expect(run([event], [{ ...held, state }])[0].decision).toMatchObject(state === "trashed"
      ? { kind: "review", reason: "remote-restored" } : { kind: "skip", reason: "deleted" });
  });
  it("skips new recurring masters but accepts shared-field updates on a mapped master", () => {
    const master = { ...event, recurrence: ["RRULE:FREQ=WEEKLY"], summary: "Changed" };
    expect(run([master], [])[0].decision).toEqual({ kind: "skip", reason: "recurring-master" });
    expect(run([master])[0].decision).toEqual({ kind: "update", fields: { ...fields, title: "Changed" } });
  });
  it.each(["confirmed", "cancelled"])("classifies %s instances before master mapping/deletion", (status) => {
    expect(run([{ id: "e1", recurringEventId: "master", status }])[0].decision).toEqual({ kind: "skip", reason: "recurring-instance" });
    expect(run([{ id: "e1", originalStartTime: { date: "2026-09-08" }, status }])[0].decision.kind).toBe("skip");
  });
  it("keeps unsupported source data for durable skip reporting", () => {
    const broken = { ...event, start: { date: "2026-02-30" } };
    const entry = run([broken])[0];
    expect(entry.decision).toEqual({ kind: "skip", reason: "invalid-event" });
    expect(entry.source).toEqual(broken);
  });
  it("does not mutate caller data or timestamps", () => {
    const before = JSON.stringify({ event, held, input });
    run();
    expect(JSON.stringify({ event, held, input })).toBe(before);
  });
});

describe("lossless schedule conversion", () => {
  const timed = (start: string, end: string): GoogleEventResource => ({ ...event, start: { dateTime: start }, end: { dateTime: end } });
  it("preserves multi-day all-day spans including leap/month boundaries", () => {
    expect(toTaskInboundFields({ ...event, start: { date: "2028-02-28" }, end: { date: "2028-03-01" } }, "Asia/Seoul"))
      .toEqual({ ok: true, fields: { ...fields, startDate: "2028-02-28", dueDate: "2028-02-29" } });
  });
  it("round-trips an imported all-day span through the existing outbound mapper", () => {
    const original = { ...event, start: { date: "2028-02-28" }, end: { date: "2028-03-01" } };
    const result = toTaskInboundFields(original, "Asia/Seoul");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outbound = toGoogleEventBody({ ...result.fields, status: "todo" }, "Asia/Seoul");
    expect(outbound.start).toEqual(original.start);
    expect(outbound.end).toEqual(original.end);
  });
  it("uses the explicitly supplied connection timezone", () => {
    const value = timed("2026-09-08T14:00:00+09:00", "2026-09-08T14:30:00+09:00");
    expect(toTaskInboundFields(value, "Asia/Shanghai")).toMatchObject({ ok: true, fields: { startTime: "13:00", endTime: "13:30" } });
  });
  it.each([
    ["2026-09-08T23:00:00Z", "2026-09-09T01:00:00Z"],
    ["2026-09-08T10:00:01Z", "2026-09-08T11:00:00Z"],
    ["2026-09-08T10:00:00.001Z", "2026-09-08T11:00:00Z"],
    ["2026-09-08T10:00:00", "2026-09-08T11:00:00"],
    ["2026-09-08T11:00:00Z", "2026-09-08T10:00:00Z"],
    ["2026-02-30T10:00:00Z", "2026-02-30T11:00:00Z"],
  ])("rejects lossy/invalid schedule %s → %s", (a, b) => {
    expect(toTaskInboundFields(timed(a, b), "UTC").ok).toBe(false);
  });
  it.each(["-04:00", "-05:00"])("rejects both sides of a DST fold (%s)", (offset) => {
    expect(toTaskInboundFields(timed(`2026-11-01T01:10:00${offset}`, `2026-11-01T01:40:00${offset}`), "America/New_York").ok).toBe(false);
  });
  it("preserves a spring-forward range with unambiguous endpoints", () => {
    expect(toTaskInboundFields(timed("2026-03-08T01:30:00-05:00", "2026-03-08T03:30:00-04:00"), "America/New_York"))
      .toMatchObject({ ok: true, fields: { startTime: "01:30", endTime: "03:30" } });
  });
  it("rejects an invalid connection timezone for timed input", () => {
    expect(toTaskInboundFields(timed("2026-09-08T10:00:00Z", "2026-09-08T11:00:00Z"), "Invalid/Zone").ok).toBe(false);
  });
});
