import { expect, it, vi } from "vitest";
import { occurrenceCandidates, occurrenceFields, readOccurrence } from "./googleOccurrenceSync";
import { parseGoogleTaskSnapshot } from "./googleTaskInboundSnapshot";

const base = { title: "Weekly", description: "", startDate: "", dueDate: "2026-09-09", startTime: "09:00", endTime: "10:00" };
function snapshot(timezone = "Asia/Seoul", fields = base, extra: Record<string, unknown> = {}) {
  return parseGoogleTaskSnapshot({ userId: "u", generation: "g", calendarId: "cal", timezone, inboxListId: "inbox", syncRevision: 1, syncToken: null,
    occurrenceSyncEnabled: true, tasks: [
      { id: "s", revision: 1, data: { ...fields, repeatType: "weekly" } },
      { id: "o", revision: 1, data: { ...fields, title: "Moved", dueDate: "2026-09-17", occurrenceOf: "s", recurrenceId: "2026-09-16" } },
    ], mappings: [{ event_id: "master", task_id: "s", generation: "g", calendar_id: "cal", state: "active", base: fields,
      source: { recurrence: ["RRULE:FREQ=WEEKLY"] } }], records: [], ...extra }, "u", "g");
}

it("addresses a timed occurrence at its original clock time, using a verified mapping without a legacy ID", () => {
  const [candidate] = occurrenceCandidates(snapshot());
  expect(candidate).toMatchObject({ masterEventId: "master", originalStart: "2026-09-16T00:00:00.000Z", kind: "occurrence-patch" });
  expect(candidate.desired?.dueDate).toBe("2026-09-17");
});

it("addresses all-day and multi-day occurrences by their start date", () => {
  const fields = { ...base, startTime: "", endTime: "", startDate: "2026-09-07" };
  expect(occurrenceFields("2026-09-16", fields)).toMatchObject({ startDate: "2026-09-14", dueDate: "2026-09-16" });
  expect(occurrenceCandidates(snapshot("Asia/Seoul", fields))[0].originalStart).toBe("2026-09-14");
});

it("holds ambiguous DST folds and invalid occurrence dates", () => {
  const data = snapshot("America/New_York", { ...base, startTime: "01:30", endTime: "02:30" });
  data.tasks.get("o")!.data.recurrenceId = "2026-11-01";
  expect(occurrenceCandidates(data)).toEqual([]);
  expect(occurrenceFields("2026-02-30", base)).toBeNull();
});

it("does not dispatch when disabled, when the series is missing, or for completed snapshots", () => {
  expect(occurrenceCandidates(snapshot("Asia/Seoul", base, { occurrenceSyncEnabled: false }))).toEqual([]);
  const data = snapshot(); data.tasks.delete("s"); expect(occurrenceCandidates(data)).toEqual([]);
  const done = snapshot(); done.tasks.get("o")!.data.completedAt = "2026-09-16T09:00:00Z";
  expect(occurrenceCandidates(done)).toEqual([]);
});

it("skip wins over an override and confirmed receipts prevent repeated deletions", () => {
  const data = snapshot(); data.tasks.get("s")!.data.exdates = ["2026-09-16"];
  expect(occurrenceCandidates(data)).toHaveLength(1);
  expect(occurrenceCandidates(data)[0]).toMatchObject({ kind: "occurrence-delete", taskId: "s" });
  data.occurrenceReceipts.push({ master_event_id: "master", occurrence_date: "2026-09-16", kind: "occurrence-delete", timezone: "Asia/Seoul" });
  expect(occurrenceCandidates(data)).toEqual([]);
});

it("finds a previously moved instance using originalStart and follows pagination", async () => {
  const [candidate] = occurrenceCandidates(snapshot());
  const source = { id: "instance", recurringEventId: "master", originalStartTime: { dateTime: "2026-09-16T09:00:00+09:00" },
    start: { dateTime: "2026-09-30T10:00:00+09:00" } };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [], nextPageToken: "next" }))
    .mockResolvedValueOnce(Response.json({ items: [source] }));
  expect(await readOccurrence(candidate, "cal", "access", fetcher)).toEqual(source);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("originalStart")).toBe(candidate.originalStart);
  expect(url.searchParams.has("timeMin")).toBe(false);
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("pageToken")).toBe("next");
});

it("does not treat an incomplete, failed, or mismatched lookup as a successful deletion", async () => {
  const [candidate] = occurrenceCandidates(snapshot());
  for (const body of [{}, { items: [] }, { items: [{ id: "foreign", recurringEventId: "other", originalStartTime: { dateTime: candidate.originalStart } }] }]) {
    await expect(readOccurrence(candidate, "cal", "access", vi.fn().mockResolvedValue(Response.json(body)))).rejects.toThrow();
  }
});
