import type { GoogleEventResource } from "./inboundShape";
import { normalizeTaskInboundFields, sameTaskInboundFields, toTaskInboundFields, type TaskInboundFields } from "./taskInboundShape";

/** All snapshots must come from one authoritative server scope, never a device-only task cache. */
export interface TaskInboundScope {
  userId: string;
  connectionGeneration: string;
  calendarId: string;
  syncRevision: number;
}

export interface TaskInboundSnapshot {
  eventId: string;
  taskId: string;
  revision: number;
  state: "active" | "trashed" | "deleted";
  fields: TaskInboundFields;
  /** Last content agreed by both sides, not the most recently observed remote content. */
  base?: TaskInboundFields;
  etag?: string;
  /** False means the app requested deletion; it is not a Google restoration. */
  remoteDeleted?: boolean;
  locallyRestored?: boolean;
}

type Decision =
  | { kind: "create"; listId: string; fields: TaskInboundFields }
  | { kind: "update"; fields: TaskInboundFields }
  | { kind: "acknowledge"; base: TaskInboundFields }
  | { kind: "keep-local" }
  | { kind: "trash" }
  | { kind: "conflict"; local: TaskInboundFields; remote: TaskInboundFields; base?: TaskInboundFields }
  | { kind: "review"; reason: "duplicate-candidate" | "ambiguous-mapping" | "remote-restored"; taskIds: string[] }
  | { kind: "skip"; reason: "recurring-instance" | "recurring-master" | "excluded" | "cancelled-unmapped" | "deleted" | "already-trashed" | "invalid-event" | "unsupported-schedule" };

export interface TaskInboundEntry {
  eventId: string;
  /** Persist this with skips/conflicts so the cursor can safely advance. Includes raw empty titles. */
  source: GoogleEventResource;
  expected: Array<{ taskId: string; revision: number }>;
  decision: Decision;
}

export type TaskInboundPlan =
  | { ok: false; reason: "missing-event-id" | "inconsistent-event-page"; entries: [] }
  | { ok: true; scope: TaskInboundScope; entries: TaskInboundEntry[] };

export interface TaskInboundInput {
  scope: TaskInboundScope;
  items: readonly GoogleEventResource[];
  snapshots: readonly TaskInboundSnapshot[];
  excludedEventIds?: ReadonlySet<string>;
  inboxListId: string;
  timezone: string;
}

function equalSchedule(a: TaskInboundFields, b: TaskInboundFields): boolean {
  return a.title === b.title && a.startDate === b.startDate && a.dueDate === b.dueDate &&
    a.startTime === b.startTime && a.endTime === b.endTime;
}

/** Plans only. This does NOT provide a lock, persistence, a cursor commit, or outbound acknowledgement. */
export function planTaskInbound(input: TaskInboundInput): TaskInboundPlan {
  const unique = new Map<string, GoogleEventResource>();
  for (const item of input.items) {
    if (typeof item.id !== "string" || !item.id.trim()) return { ok: false, reason: "missing-event-id", entries: [] };
    const previous = unique.get(item.id);
    // Never guess which duplicate resource is newer from its client-facing timestamp.
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {
      return { ok: false, reason: "inconsistent-event-page", entries: [] };
    }
    unique.set(item.id, item);
  }

  const entries: TaskInboundEntry[] = [];
  for (const [eventId, source] of unique) {
    const matches = input.snapshots.filter((s) => s.eventId === eventId);
    const mine = matches[0];
    let decision: Decision;
    // A cancelled occurrence is NOT a cancelled master. This must precede deletion.
    if (source.recurringEventId !== undefined || source.originalStartTime !== undefined) {
      decision = { kind: "skip", reason: "recurring-instance" };
    } else if (matches.length > 1) {
      decision = { kind: "review", reason: "ambiguous-mapping", taskIds: matches.map((s) => s.taskId) };
    } else if (source.status === "cancelled") {
      decision = !mine ? { kind: "skip", reason: "cancelled-unmapped" }
        : mine.state === "active" ? { kind: "trash" }
        : { kind: "skip", reason: mine.state === "deleted" ? "deleted" : "already-trashed" };
    } else if (mine?.state === "deleted") {
      decision = { kind: "skip", reason: "deleted" };
    } else if (mine?.state === "trashed") {
      decision = mine.remoteDeleted === false && !mine.locallyRestored ? { kind: "skip", reason: "already-trashed" }
        : { kind: "review", reason: "remote-restored", taskIds: [mine.taskId] };
    } else if (input.excludedEventIds?.has(eventId) && !mine) {
      decision = { kind: "skip", reason: "excluded" };
    } else if (!mine && Array.isArray(source.recurrence) && source.recurrence.length > 0) {
      decision = { kind: "skip", reason: "recurring-master" };
    } else if ((source.status !== undefined && source.status !== "confirmed" && source.status !== "tentative") ||
        (source.recurrence !== undefined && !Array.isArray(source.recurrence))) {
      decision = { kind: "skip", reason: "invalid-event" };
    } else {
      const shape = toTaskInboundFields(source, input.timezone);
      if (!shape.ok) {
        decision = { kind: "skip", reason: shape.reason };
      } else if (!mine) {
        const candidates = input.snapshots.filter((s) => s.state === "active" && equalSchedule(normalizeTaskInboundFields(s.fields), shape.fields));
        decision = candidates.length
          ? { kind: "review", reason: "duplicate-candidate", taskIds: candidates.map((s) => s.taskId) }
          : { kind: "create", listId: input.inboxListId, fields: shape.fields };
      } else {
        const local = normalizeTaskInboundFields(mine.fields);
        const remote = shape.fields;
        if (sameTaskInboundFields(local, remote)) {
          decision = { kind: "acknowledge", base: remote };
        } else if (mine.base && sameTaskInboundFields(remote, mine.base)) {
          decision = { kind: "keep-local" };
        } else if (mine.base && sameTaskInboundFields(local, mine.base)) {
          decision = { kind: "update", fields: remote };
        } else {
          decision = { kind: "conflict", local, remote, ...(mine.base ? { base: normalizeTaskInboundFields(mine.base) } : {}) };
        }
      }
    }
    entries.push({ eventId, source, expected: matches.map((s) => ({ taskId: s.taskId, revision: s.revision })), decision });
  }
  return { ok: true, scope: { ...input.scope }, entries };
}
