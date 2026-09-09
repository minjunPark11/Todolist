import type { GoogleEventResource } from "./inboundShape";
import type { TaskInboundScope } from "./taskInboundPlan";

export interface LegacyTaskMapping {
  taskId: string;
  revision: number;
  googleEventId: string;
}
export interface LegacyMappingProof {
  taskId: string;
  eventId: string;
  userId: string;
  connectionGeneration: string;
  calendarId: string;
  /** Reference to separately verified historical ownership, never an email/title match. */
  evidenceRef: string;
}
export type LegacyEventObservation =
  | { eventId: string; kind: "found"; source: GoogleEventResource }
  | { eventId: string; kind: "missing" | "unavailable" };
export interface LegacyMappingEntry {
  eventId: string;
  expected: Array<{ taskId: string; revision: number }>;
  decision: { kind: "register"; taskId: string; evidenceRef: string } |
    { kind: "review"; reason: "duplicate-event-id" | "ownership-unverified" | "event-missing" |
      "event-unavailable" | "recurring-instance" | "existing-mapping" };
  source?: GoogleEventResource;
}

/** Audit a complete authoritative task snapshot. Never infer ownership or an agreed content base. */
export function planLegacyMappings(input: {
  scope: TaskInboundScope;
  tasks: readonly LegacyTaskMapping[];
  proofs: readonly LegacyMappingProof[];
  observations: readonly LegacyEventObservation[];
  existing: readonly { taskId: string; eventId: string }[];
}): { scope: TaskInboundScope; entries: LegacyMappingEntry[] } {
  const ids = new Set<string>();
  const groups = new Map<string, LegacyTaskMapping[]>();
  for (const task of input.tasks) {
    if (!task.taskId || ids.has(task.taskId) || !Number.isSafeInteger(task.revision) || task.revision < 1) {
      throw new Error("Invalid authoritative task snapshot");
    }
    ids.add(task.taskId);
    if (!task.googleEventId.trim()) continue;
    const group = groups.get(task.googleEventId) ?? [];
    group.push(task); groups.set(task.googleEventId, group);
  }
  const observations = new Map<string, LegacyEventObservation>();
  for (const item of input.observations) {
    if (!item.eventId || observations.has(item.eventId) || (item.kind === "found" && item.source.id !== item.eventId)) {
      throw new Error("Inconsistent event observations");
    }
    observations.set(item.eventId, item);
  }
  const entries: LegacyMappingEntry[] = [];
  for (const [eventId, tasks] of groups) {
    const task = tasks[0];
    const observation = observations.get(eventId);
    const source = observation?.kind === "found" ? observation.source : undefined;
    const proof = input.proofs.filter(p => p.taskId === task.taskId && p.eventId === eventId &&
      p.userId === input.scope.userId && p.calendarId === input.scope.calendarId &&
      p.connectionGeneration === input.scope.connectionGeneration && p.evidenceRef.trim());
    let decision: LegacyMappingEntry["decision"];
    if (tasks.length > 1) decision = { kind: "review", reason: "duplicate-event-id" };
    else if (input.existing.some(m => m.eventId === eventId || m.taskId === task.taskId)) decision = { kind: "review", reason: "existing-mapping" };
    else if (proof.length !== 1) decision = { kind: "review", reason: "ownership-unverified" };
    else if (observation?.kind === "missing") decision = { kind: "review", reason: "event-missing" };
    else if (!source) decision = { kind: "review", reason: "event-unavailable" };
    else if (source.recurringEventId !== undefined || source.originalStartTime !== undefined) decision = { kind: "review", reason: "recurring-instance" };
    else decision = { kind: "register", taskId: task.taskId, evidenceRef: proof[0].evidenceRef };
    entries.push({ eventId, expected: tasks.map(t => ({ taskId: t.taskId, revision: t.revision })), decision, ...(source ? { source } : {}) });
  }
  return { scope: { ...input.scope }, entries };
}
