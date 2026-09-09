import { isLocalDate } from "../../schedule/types";
import type { GoogleEventResource } from "./inboundShape";
import type { TaskInboundScope, TaskInboundSnapshot } from "./taskInboundPlan";
import { normalizeTaskInboundFields, sameTaskInboundFields, toTaskInboundFields, type TaskInboundFields } from "./taskInboundShape";

/** Explicit nulls clear the other schedule representation during a PATCH. */
type Boundary = { date: string | null; dateTime: string | null; timeZone: string | null };
export interface TaskSharedPatch {
  summary: string;
  description: string;
  start: Boundary;
  end: Boundary;
}

// Resolve a wall minute using the pinned zone, rejecting gaps and folds instead of guessing.
export function resolveMinute(date: string, time: string, timezone: string): string | null {
  const stamp = Date.parse(`${date}T${time}:00Z`);
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wall = (ms: number) => {
    const p = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, part.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  };
  const candidates = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = stamp + hours * 3_600_000;
    const candidate = stamp - (wall(sample) - sample);
    if (wall(candidate) === stamp) candidates.add(candidate);
  }
  return candidates.size === 1 ? new Date([...candidates][0]).toISOString() : null;
}

/** No one-hour defaults, invalid-date rollover, or discarded multi-day timed ranges. */
export function toTaskSharedPatch(fields: TaskInboundFields, timezone: string): TaskSharedPatch | null {
  const f = normalizeTaskInboundFields(fields);
  if (!isLocalDate(f.dueDate) || (f.startDate && (!isLocalDate(f.startDate) || f.startDate > f.dueDate))) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    const content = { summary: f.title, description: f.description };
    if (!f.startTime && !f.endTime) {
      const end = new Date(Date.parse(`${f.dueDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      if (!isLocalDate(end)) return null;
      return { ...content, start: { date: f.startDate || f.dueDate, dateTime: null, timeZone: null },
        end: { date: end, dateTime: null, timeZone: null } };
    }
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (f.startDate || !time.test(f.startTime) || !time.test(f.endTime) || f.endTime <= f.startTime) return null;
    const start = resolveMinute(f.dueDate, f.startTime, timezone);
    const end = resolveMinute(f.dueDate, f.endTime, timezone);
    if (!start || !end) return null;
    return { ...content, start: { date: null, dateTime: start, timeZone: timezone },
      end: { date: null, dateTime: end, timeZone: timezone } };
  } catch { return null; }
}

export interface TaskOutboundInput {
  scope: TaskInboundScope;
  snapshot: TaskInboundSnapshot;
  /** A fresh GET of this exact mapped original; missing/failed GET is not a deletion. */
  source: GoogleEventResource | null;
  timezone: string;
  /** Any persisted conflict/review/exclusion must be settled explicitly. */
  held?: boolean;
}
type Action =
  | { kind: "hold"; reason: string }
  | { kind: "inbound-required" }
  | { kind: "acknowledge"; base: TaskInboundFields; etag: string }
  | { kind: "conflict"; local: TaskInboundFields; remote: TaskInboundFields; base?: TaskInboundFields }
  | { kind: "patch"; ifMatch: string; fields: TaskInboundFields; body: TaskSharedPatch };
export interface TaskOutboundPlan {
  scope: TaskInboundScope;
  expected: { taskId: string; revision: number; eventId: string };
  action: Action;
}

/** A plan is not permission to send: the server must reserve it with revision/fence CAS first. */
export function planTaskOutbound(input: TaskOutboundInput): TaskOutboundPlan {
  const s = input.snapshot;
  const result = (action: Action): TaskOutboundPlan => ({ scope: { ...input.scope },
    expected: { taskId: s.taskId, revision: s.revision, eventId: s.eventId }, action });
  if (input.held) return result({ kind: "hold", reason: "resolution-required" });
  if (!s.eventId || !s.taskId || !Number.isSafeInteger(s.revision) || s.revision < 1 || s.state !== "active") {
    return result({ kind: "hold", reason: "active-mapping-required" });
  }
  const source = input.source;
  if (!source || source.id !== s.eventId) return result({ kind: "hold", reason: "exact-event-required" });
  if (source.recurringEventId !== undefined || source.originalStartTime !== undefined) return result({ kind: "hold", reason: "recurring-instance" });
  if (source.status === "cancelled") return result({ kind: "inbound-required" });
  if ((source.status !== undefined && source.status !== "confirmed" && source.status !== "tentative") ||
      (source.recurrence !== undefined && !Array.isArray(source.recurrence))) return result({ kind: "hold", reason: "invalid-event" });
  if (typeof source.etag !== "string" || !source.etag.trim() || source.etag === "*") return result({ kind: "hold", reason: "etag-required" });
  const shape = toTaskInboundFields(source, input.timezone);
  if (!shape.ok) return result({ kind: "hold", reason: shape.reason });
  const local = normalizeTaskInboundFields(s.fields);
  const remote = shape.fields;
  if (sameTaskInboundFields(local, remote)) return result({ kind: "acknowledge", base: remote, etag: source.etag });
  if (!s.base || (!sameTaskInboundFields(remote, s.base) && !sameTaskInboundFields(local, s.base))) {
    return result({ kind: "conflict", local, remote, ...(s.base ? { base: normalizeTaskInboundFields(s.base) } : {}) });
  }
  if (sameTaskInboundFields(local, s.base)) return result({ kind: "inbound-required" });
  const body = toTaskSharedPatch(local, input.timezone);
  return result(body ? { kind: "patch", ifMatch: source.etag, fields: local, body }
    : { kind: "hold", reason: "unsupported-local-schedule" });
}

/** The exact content/version displayed when the user selected a conflict winner. Not authorization. */
export interface TaskConflictSelection {
  scope: TaskInboundScope;
  eventId: string;
  taskId: string;
  taskRevision: number;
  recordRevision: number;
  etag: string;
  local: TaskInboundFields;
  remote: TaskInboundFields;
  choice: "app" | "google";
}
export type TaskConflictResolution =
  | { kind: "hold"; reason: string }
  | { kind: "accept-google"; expected: TaskConflictSelection; fields: TaskInboundFields }
  | { kind: "accept-app"; expected: TaskConflictSelection; fields: TaskInboundFields; ifMatch: string; body: TaskSharedPatch };

/** Mapping/restore/duplicate reviews require their own choice; they cannot use the conflict shortcut. */
export function planTaskConflictResolution(input: TaskOutboundInput, record: { revision: number; kind: string },
  selection: TaskConflictSelection): TaskConflictResolution {
  const hold = (reason: string): TaskConflictResolution => ({ kind: "hold", reason });
  const a = input.scope, b = selection.scope;
  if (a.userId !== b.userId || a.connectionGeneration !== b.connectionGeneration || a.calendarId !== b.calendarId ||
      a.syncRevision !== b.syncRevision || selection.eventId !== input.snapshot.eventId ||
      selection.taskId !== input.snapshot.taskId || selection.taskRevision !== input.snapshot.revision ||
      !Number.isSafeInteger(record.revision) || record.revision < 1 || record.revision !== selection.recordRevision ||
      input.source?.etag !== selection.etag || !sameTaskInboundFields(input.snapshot.fields, selection.local)) return hold("stale-selection");
  if (record.kind !== "conflict") return hold("different-review-required");
  if (selection.choice !== "app" && selection.choice !== "google") return hold("invalid-choice");
  const plan = planTaskOutbound({ ...input, held: false });
  if (plan.action.kind === "hold" || plan.action.kind === "inbound-required") return hold("refresh-required");
  const shape = input.source && toTaskInboundFields(input.source, input.timezone);
  if (!shape || !shape.ok || !sameTaskInboundFields(shape.fields, selection.remote)) return hold("stale-selection");
  // Clone the approval snapshot so later UI mutations cannot rewrite a queued intent.
  const expected = structuredClone(selection);
  if (selection.choice === "google") return { kind: "accept-google", expected, fields: shape.fields };
  const fields = normalizeTaskInboundFields(input.snapshot.fields);
  const body = toTaskSharedPatch(fields, input.timezone);
  return body ? { kind: "accept-app", expected, fields, ifMatch: selection.etag, body } : hold("unsupported-local-schedule");
}

/** Validate a PATCH response (or reconciliation GET) against the reserved desired content.
 * The eventual settlement RPC must still validate the server operation ID and mapping scope.
 * Never copy this base onto newer local fields or settle an unreserved client-only plan.
 */
export function inspectTaskOutboundResult(intent: { eventId: string; fields: TaskInboundFields; timezone: string; allowRecurring?: boolean },
  source: GoogleEventResource | null): { kind: "agree"; base: TaskInboundFields; etag: string } | { kind: "reconcile-required" } {
  const retry = { kind: "reconcile-required" } as const;
  if (!source || source.id !== intent.eventId || source.status === "cancelled" ||
      (source.status !== undefined && source.status !== "confirmed" && source.status !== "tentative") ||
      source.recurringEventId !== undefined || source.originalStartTime !== undefined ||
      (source.recurrence !== undefined && (!Array.isArray(source.recurrence) || (!intent.allowRecurring && source.recurrence.length > 0))) ||
      typeof source.etag !== "string" || !source.etag.trim() || source.etag === "*") return retry;
  const shape = toTaskInboundFields(source, intent.timezone);
  return shape.ok && sameTaskInboundFields(shape.fields, intent.fields)
    ? { kind: "agree", base: shape.fields, etag: source.etag } : retry;
}
