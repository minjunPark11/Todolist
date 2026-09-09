import { normalizeTaskInboundFields, toTaskInboundFields } from "../domain/calendar/googleSync/taskInboundShape";
import { planTaskOutbound, toTaskSharedPatch } from "../domain/calendar/googleSync/taskOutboundPlan";
import { taskRecurrence } from "../domain/calendar/googleSync/taskRecurrence";
import { object, parseGoogleTaskSnapshot, text } from "./googleTaskInboundSnapshot";
import { runGoogleTaskInbound, type GoogleTaskInboundDeps } from "./googleTaskInboundExecutor";
import { GoogleOccurrenceChanged, occurrenceCandidates, readOccurrence } from "./googleOccurrenceSync";
import { sameTaskInboundFields } from "../domain/calendar/googleSync/taskInboundShape";

export type GoogleTaskSnapshot = ReturnType<typeof parseGoogleTaskSnapshot>;
export interface GoogleTaskChoice {
  eventId: string; recordRevision: number; taskRevision?: number;
  choice: "app" | "google" | "import" | "exclude" | "restore" | "recurrence" | "transfer";
  taskId?: string;
  generation: string; source: Record<string, unknown>;
}
export interface GoogleTaskCoordinatorDeps extends GoogleTaskInboundDeps {
  dispatch(operationId: string): Promise<"completed" | "aborted" | "pending">;
  readIntent(): unknown;
  writeIntent(value: unknown): void;
}
export class GoogleTaskSelectionChanged extends Error {
  constructor() { super("The content changed. Review the latest versions and choose again."); }
}

/** The planner bridge drains local task writes before entering and adopts revisions after returning. */
export async function runGoogleTaskCycle(request: { userId: string; generation: string; accessToken: string },
  deps: GoogleTaskCoordinatorDeps, choice?: GoogleTaskChoice): Promise<{ snapshot: GoogleTaskSnapshot; pending: boolean }> {
  const call = async (name: string, args: Record<string, unknown>) => { await deps.assertCurrent(); return deps.rpc(name, args); };
  const snapshot = async () => parseGoogleTaskSnapshot(await call("read_google_task_sync_snapshot", { p_generation: request.generation }), request.userId, request.generation);
  // Resolve ambiguous database replies with exactly the same durable request first.
  const intent = deps.readIntent();
  if (intent) {
    const saved = object(intent), args = object(saved.args);
    if (saved.userId !== request.userId || saved.generation !== request.generation ||
      !["reserve_google_task_outbound", "resolve_google_task_review", "reserve_google_task_event", "reserve_google_task_recurrence", "reserve_google_task_occurrence"].includes(String(saved.name))) throw new Error("Invalid pending Google task intent.");
    try { await call(String(saved.name), args); }
    catch (error) {
      if (["40001", "22023", "P0001"].includes(String((error as {code?:string})?.code))) { await deps.assertCurrent(); deps.writeIntent(null); throw new GoogleTaskSelectionChanged(); }
      throw error;
    }
    await deps.assertCurrent(); deps.writeIntent(null);
    if (choice) throw new GoogleTaskSelectionChanged();
  }
  let current = await snapshot();
  for (const operation of current.operations) {
    const result = await deps.dispatch(text(operation.operation_id));
    if (result === "pending") return { snapshot: await snapshot(), pending: true };
  }
  if (!choice) {
    await runGoogleTaskInbound(request, deps);
  }
  const owner = deps.uuid();
  let fence: unknown;
  const claim = async () => {
    const lease = object(await call("claim_google_task_sync", { p_generation: request.generation, p_owner: owner }));
    if (fence !== undefined && lease.fence !== fence) throw new Error("Google task lease changed.");
    fence = lease.fence; return lease;
  };
  const reserve = async (name: string, body: Record<string, unknown>) => {
    const args = { p_operation_id: deps.uuid(), p_request: body };
    await deps.assertCurrent(); deps.writeIntent({ userId: request.userId, generation: request.generation, name, args });
    try { await call(name, args); }
    catch (error) {
      // Explicit transaction rejection is not response loss; no mutation was accepted.
      const code = (error as { code?: string })?.code;
      if (code === "40001" || code === "22023" || code === "P0001") { deps.writeIntent(null); throw new GoogleTaskSelectionChanged(); }
      throw error;
    }
    await deps.assertCurrent(); deps.writeIntent(null); return args.p_operation_id;
  };
  try {
    await claim(); current = await snapshot();
    const body = (eventId: string) => ({ generation: request.generation, calendarId: current.scope.calendarId,
      syncRevision: current.scope.syncRevision, owner, fence, eventId });
    if (choice) {
      if (choice.choice === "transfer") {
        const row = current.tasks.get(choice.taskId ?? "");
        if (choice.generation !== request.generation || !row || row.revision !== choice.taskRevision ||
          !current.historicalTaskIds.has(choice.taskId!)) throw new GoogleTaskSelectionChanged();
        const id = await reserve("reserve_google_task_event", { ...body(""), taskId: choice.taskId,
          taskRevision: row.revision, choice: "transfer", kind: "create" });
        return { pending: await deps.dispatch(id) === "pending", snapshot: await snapshot() };
      }
      const record = current.records.find(r => r.eventId === choice.eventId);
      const mapped = current.snapshots.find(t => t.eventId === choice.eventId);
      if (choice.generation !== request.generation || !record || record.revision !== choice.recordRevision ||
        (mapped && mapped.revision !== choice.taskRevision) || JSON.stringify(record.source) !== JSON.stringify(choice.source)) throw new GoogleTaskSelectionChanged();
      // A selection applies to the displayed remote version, never a later GET version.
      await deps.assertCurrent();
      const response = await deps.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(current.scope.calendarId)}/events/${encodeURIComponent(choice.eventId)}`,
        { headers: { Authorization: `Bearer ${request.accessToken}` }, redirect: "error" });
      if (!response.ok) throw new GoogleTaskSelectionChanged();
      const fresh = object(await response.json());
      if (fresh.id !== choice.eventId || typeof fresh.etag !== "string" || fresh.etag !== record.source.etag) throw new GoogleTaskSelectionChanged();
      await claim();
      if (choice.choice === "recurrence") {
        if (!mapped || record.decision.kind !== "acknowledge") throw new GoogleTaskSelectionChanged();
        const id = await reserve("reserve_google_task_recurrence", { ...body(choice.eventId), taskId: mapped.taskId,
          taskRevision: mapped.revision, recordRevision: record.revision, source: record.source, choice: "recurrence" });
        if (await deps.dispatch(id) === "pending") return { snapshot: await snapshot(), pending: true };
      } else if (choice.choice === "app" || choice.choice === "google") {
        if (!mapped || record.decision.kind !== "conflict") throw new GoogleTaskSelectionChanged();
        const id = await reserve("reserve_google_task_outbound", { ...body(choice.eventId), taskId: mapped.taskId, taskRevision: mapped.revision,
          recordRevision: record.revision, source: record.source, local: normalizeTaskInboundFields(mapped.fields), remote: record.decision.remote, choice: choice.choice });
        if (choice.choice === "app" && await deps.dispatch(id) === "pending") return { snapshot: await snapshot(), pending: true };
      } else {
        const shape = toTaskInboundFields(fresh, current.timezone);
        if (choice.choice !== "exclude" && !shape.ok) throw new Error("This schedule cannot be imported without losing information.");
        await reserve("resolve_google_task_review", { ...body(choice.eventId), taskRevision: mapped?.revision,
          recordRevision: record.revision, source: record.source, fields: shape.ok ? shape.fields : undefined, choice: choice.choice });
      }
      return { snapshot: await snapshot(), pending: false };
    }
    // Bounded pass: remaining items are retried on the next timer/manual request.
    const candidates = current.snapshots.filter(s => {
      const r = current.records.find(r=>r.eventId===s.eventId && r.decision.kind==='keep-local');
      return r && planTaskOutbound({ scope: current.scope, snapshot: s, source: r.source, timezone: current.timezone }).action.kind === 'patch';
    });
    for (const candidate of candidates.slice(0, 30)) {
      await claim(); current = await snapshot();
      const mapped = current.snapshots.find(s => s.eventId === candidate.eventId && s.taskId === candidate.taskId);
      if (!mapped) continue;
      const record = current.records.find(r => r.eventId === mapped.eventId);
      if (!record || record.decision.kind !== "keep-local") continue;
      const planned = planTaskOutbound({ scope: current.scope, snapshot: mapped, source: record.source, timezone: current.timezone });
      if (planned.action.kind !== "patch") continue;
      const id = await reserve("reserve_google_task_outbound", { ...body(mapped.eventId), taskId: mapped.taskId, taskRevision: mapped.revision,
        recordRevision: record.revision, source: record.source, local: planned.action.fields, remote: mapped.base, choice: "automatic" });
      if (await deps.dispatch(id) === "pending") return { snapshot: await snapshot(), pending: true };
    }
    const lifecycle = [
      ...current.snapshots.filter(s => s.eventId && (s.state === "trashed" || s.state === "deleted") && s.remoteDeleted === false && !s.locallyRestored &&
        current.records.some(r => r.eventId === s.eventId && r.decision.reason !== 'excluded'))
        .map(s => ({ kind: "delete", taskId: s.taskId, eventId: s.eventId })),
      ...[...current.tasks].filter(([id, row]) => {
        const mappings = current.snapshots.filter(s => s.taskId === id && s.eventId);
        const fields = current.snapshots.find(s => s.taskId === id)?.fields;
        return !(row.data.occurrenceOf && row.data.recurrenceId) && !row.data.deletedAt && !["abandoned", "given_up"].includes(String(row.data.status)) &&
          fields && toTaskSharedPatch(fields, current.timezone) &&
          taskRecurrence(row.data, current.timezone) !== null &&
          (mappings.length ? mappings.every(s => s.remoteDeleted && s.state !== "active") : !row.data.googleEventId && !current.historicalTaskIds.has(id));
      }).map(([taskId]) => ({ kind: "create", taskId, eventId: "" })),
    ];
    for (const candidate of lifecycle.slice(0, 30)) {
      await claim(); current = await snapshot();
      const row = current.tasks.get(candidate.taskId), mapped = current.snapshots.find(s => s.taskId === candidate.taskId);
      const record = current.records.find(r => r.eventId === candidate.eventId);
      if (candidate.kind === "create" && (!mapped || !toTaskSharedPatch(mapped.fields, current.timezone))) continue;
      if (candidate.kind === "delete" && (!record || record.decision.reason === "excluded")) continue;
      const id = await reserve("reserve_google_task_event", { ...body(candidate.eventId), kind: candidate.kind,
        taskId: candidate.taskId, taskRevision: row?.revision ?? 0, recordRevision: record?.revision, source: record?.source });
      if (await deps.dispatch(id) === "pending") return { snapshot: await snapshot(), pending: true };
    }
    current = await snapshot();
    for (const candidate of occurrenceCandidates(current).slice(0, 30)) {
      await deps.assertCurrent();
      const source = await readOccurrence(candidate, current.scope.calendarId, request.accessToken, deps.fetch);
      const remote = toTaskInboundFields(source, current.timezone);
      if (source.status !== "cancelled" && (!remote.ok || !sameTaskInboundFields(remote.fields, candidate.base))) {
        throw new GoogleOccurrenceChanged(candidate.desired?.title ?? candidate.base.title, candidate.occurrenceDate);
      }
      if (source.status === "cancelled" && candidate.kind !== "occurrence-delete") throw new GoogleOccurrenceChanged(candidate.base.title, candidate.occurrenceDate);
      await claim(); current = await snapshot();
      const id = await reserve("reserve_google_task_occurrence", { ...body(String(source.id)), ...candidate,
        source, remote: remote.ok ? remote.fields : null });
      if (await deps.dispatch(id) === "pending") return { snapshot: await snapshot(), pending: true };
    }
    return { snapshot: await snapshot(), pending: false };
  } finally {
    if (fence !== undefined) await call("release_google_task_sync", { p_generation: request.generation, p_owner: owner, p_fence: fence }).catch(() => undefined);
  }
}
