import { isLocalDate } from "../domain/schedule/types";
import { resolveMinute, toTaskSharedPatch } from "../domain/calendar/googleSync/taskOutboundPlan";
import { normalizeTaskInboundFields, sameTaskInboundFields, type TaskInboundFields } from "../domain/calendar/googleSync/taskInboundShape";
import type { GoogleTaskSnapshot } from "./googleTaskCoordinator";
import { object } from "./googleTaskInboundSnapshot";

export interface OccurrenceCandidate {
  kind: "occurrence-patch" | "occurrence-delete";
  taskId: string; taskRevision: number; seriesId: string; seriesRevision: number;
  masterEventId: string; occurrenceDate: string; originalStart: string;
  desired: TaskInboundFields | null; base: TaskInboundFields;
}

export class GoogleOccurrenceChanged extends Error {
  constructor(readonly title: string, readonly date: string) {
    super("The Google occurrence changed. Local edits were not sent.");
  }
}

/** The app names a recurrence by its due date; Google names it by its original START. */
export function occurrenceFields(date: string, master: TaskInboundFields): TaskInboundFields | null {
  if (!isLocalDate(date) || !isLocalDate(master.dueDate)) return null;
  const delta = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${master.dueDate}T00:00:00Z`);
  const startDate = master.startDate
    ? new Date(Date.parse(`${master.startDate}T00:00:00Z`) + delta).toISOString().slice(0, 10) : "";
  return { ...master, dueDate: date, startDate };
}

export function occurrenceCandidates(snapshot: GoogleTaskSnapshot): OccurrenceCandidate[] {
  if (!snapshot.occurrenceSyncEnabled) return [];
  const result: OccurrenceCandidate[] = [];
  for (const [seriesId, series] of snapshot.tasks) {
    if (series.data.deletedAt || series.data.occurrenceOf) continue;
    const mapped = snapshot.snapshots.find(m => m.taskId === seriesId && m.state === "active" && !m.remoteDeleted && m.base);
    if (!mapped?.base) continue;
    const source = snapshot.seriesSources.get(mapped.eventId);
    if (!source || !Array.isArray(source.recurrence) || !source.recurrence.length) continue;
    const rows = [...snapshot.tasks].filter(([, row]) => row.data.occurrenceOf === seriesId && isLocalDate(row.data.recurrenceId));
    const skips = new Set(Array.isArray(series.data.exdates) ? series.data.exdates.filter(isLocalDate) : []);
    for (const [, row] of rows) if (row.data.deletedAt) skips.add(String(row.data.recurrenceId));
    const dates = new Set([...skips, ...rows.map(([, row]) => String(row.data.recurrenceId))]);
    for (const date of dates) {
      const matches = rows.filter(([, row]) => row.data.recurrenceId === date && !row.data.deletedAt);
      if (!skips.has(date) && (matches.length !== 1 || matches[0][1].data.completedAt || ["done", "completed", "abandoned", "given_up"].includes(String(matches[0][1].data.status)))) continue;
      const base = occurrenceFields(date, mapped.base);
      if (!base) continue;
      const startDate = base.startDate || base.dueDate;
      const originalStart = base.startTime ? resolveMinute(startDate, base.startTime, snapshot.timezone) : startDate;
      if (!originalStart) continue;
      const [taskId, row] = skips.has(date) ? [seriesId, series] : matches[0];
      const desired = skips.has(date) ? null : normalizeTaskInboundFields(Object.fromEntries(
        ["title", "description", "startDate", "dueDate", "startTime", "endTime"].map(k => [k, typeof row.data[k] === "string" ? row.data[k] : ""]),
      ) as unknown as TaskInboundFields);
      if (desired && !toTaskSharedPatch(desired, snapshot.timezone)) continue;
      const receipt = snapshot.occurrenceReceipts.find(r => r.master_event_id === mapped.eventId && r.occurrence_date === date);
      const kind = desired ? "occurrence-patch" : "occurrence-delete";
      if (receipt?.kind === kind && receipt.timezone === snapshot.timezone &&
        (!desired || sameTaskInboundFields(desired, receipt.fields as unknown as TaskInboundFields))) continue;
      result.push({ kind, taskId, taskRevision: row.revision, seriesId, seriesRevision: series.revision,
        masterEventId: mapped.eventId, occurrenceDate: date, originalStart, desired,
        base: receipt?.kind === "occurrence-patch" && receipt.timezone === snapshot.timezone
          ? receipt.fields as unknown as TaskInboundFields : base });
    }
  }
  return result;
}

export function matchesOccurrence(source: Record<string, unknown>, master: string, originalStart: string): boolean {
  if (source.recurringEventId !== master || !source.originalStartTime || typeof source.originalStartTime !== "object") return false;
  const original = source.originalStartTime as Record<string, unknown>;
  return isLocalDate(originalStart) ? original.date === originalStart
    : typeof original.dateTime === "string" && Date.parse(original.dateTime) === Date.parse(originalStart);
}

/** originalStart still finds an exception after it has moved outside its original date. */
export async function readOccurrence(candidate: OccurrenceCandidate, calendarId: string, accessToken: string, fetchImpl: typeof fetch) {
  const params = new URLSearchParams({ originalStart: candidate.originalStart, showDeleted: "true", maxResults: "250" });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(candidate.masterEventId)}/instances`;
  let found: Record<string, unknown> | null = null;
  const seen = new Set<string>();
  do {
    const response = await fetchImpl(`${url}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error" });
    if (!response.ok) throw new Error("Could not read the Google occurrence.");
    const page = object(await response.json());
    if (!Array.isArray(page.items)) throw new Error("Invalid Google instances response.");
    for (const item of page.items) {
      const source = object(item);
      if (!matchesOccurrence(source, candidate.masterEventId, candidate.originalStart)) continue;
      if (found) throw new Error("Ambiguous Google occurrence.");
      found = source;
    }
    if (!page.nextPageToken) break;
    if (typeof page.nextPageToken !== "string" || seen.has(page.nextPageToken) || seen.size >= 20) throw new Error("Invalid Google instance pagination.");
    seen.add(page.nextPageToken); params.set("pageToken", page.nextPageToken);
  } while (true);
  if (!found || typeof found.id !== "string" || !found.id) throw new Error("Google occurrence no longer exists.");
  if (found.status === "cancelled" && candidate.kind === "occurrence-delete") return found;
  return found;
}
