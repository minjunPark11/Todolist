import { randomUUID } from "node:crypto";
import { taskRecurrence, sameRecurrence } from "../../domain/calendar/googleSync/taskRecurrence";
import { inspectTaskOutboundResult, toTaskSharedPatch } from "../../domain/calendar/googleSync/taskOutboundPlan";
import { sameTaskInboundFields, toTaskInboundFields, type TaskInboundFields } from "../../domain/calendar/googleSync/taskInboundShape";
import type { GoogleEventResource } from "../../domain/calendar/googleSync/inboundShape";
import { readServiceRoleEnv, readGoogleOAuthEnv, type ServiceRoleEnv } from "./env";
import { refreshAccessToken } from "./oauth";
import { verifyGoogleIdentity } from "./identity";

interface Binding { generation: string; calendarId: string }
export interface GoogleTaskOutboundDeps {
  /** Service-only RPC transport, never a browser-provided service key or arbitrary RPC name. */
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  accessToken(binding: Binding): Promise<string>;
  fetch: typeof fetch;
  uuid(): string;
}
export class GoogleTaskOutboundError extends Error {
  constructor() { super("The Google task write needs reconciliation before another attempt."); this.name = "GoogleTaskOutboundError"; }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GoogleTaskOutboundError();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new GoogleTaskOutboundError();
  return value;
}
function fields(value: unknown): TaskInboundFields {
  const v = object(value);
  const names = ["title", "description", "startDate", "dueDate", "startTime", "endTime"];
  if (Object.keys(v).length !== names.length || names.some(k => typeof v[k] !== "string")) throw new GoogleTaskOutboundError();
  return v as unknown as TaskInboundFields;
}

/** One server invocation, one possible PATCH. Retrying this function cannot redispatch a running operation. */
export async function runReservedGoogleTaskOutbound(userId: string, operationId: string, deps: GoogleTaskOutboundDeps): Promise<{ state: "completed" | "aborted" | "pending" }> {
  const dispatchId = deps.uuid();
  const identity = { p_user_id: userId, p_operation_id: operationId, p_dispatch_id: dispatchId };
  // Deliberately no retry: a lost dispatch response leaves the durable operation for recovery.
  const begin = object(await deps.rpc("begin_google_task_outbound", identity));
  if (begin.send === false) {
    if (begin.state === "running" || begin.state === "uncertain") return reconcileGoogleTaskOutbound(userId, operationId, deps);
    return { state: begin.state === "completed" || begin.state === "aborted" ? begin.state : "pending" };
  }
  if (begin.send !== true) throw new GoogleTaskOutboundError();
  const finish = async (outcome: "applied" | "rejected" | "uncertain", source: unknown = null, agreed: unknown = null): Promise<{ state: "completed" | "aborted" | "pending" }> => {
    const args = { ...identity, p_outcome: outcome, p_source: source, p_fields: agreed };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const receipt = object(await deps.rpc("finish_google_task_outbound", args));
        if (outcome === "uncertain" && receipt.state === "uncertain") return { state: "pending" } as const;
        const state = outcome === "applied" ? "completed" : "aborted";
        if (receipt.finished === true && receipt.state === state) return { state };
      } catch { /* Retry the exact DB receipt only. */ }
    }
    throw new GoogleTaskOutboundError();
  };
  if (begin.kind === "create" || begin.kind === "delete") return runEventOperation(begin, operationId, deps, finish);
  let sent = false;
  try {
    const calendarId = text(begin.calendarId), eventId = text(begin.eventId), generation = text(begin.generation);
    const timezone = text(begin.timezone), desired = fields(begin.fields), remote = fields(begin.remote);
    const reservedSource = object(begin.source), etag = text(reservedSource.etag);
    const patch = toTaskSharedPatch(desired, timezone);
    const recurrence = begin.kind === "recurrence" ? taskRecurrence({ ...desired, ...object(begin.repeatTask) }, timezone) : undefined;
    if (!patch || recurrence === null || reservedSource.id !== eventId || etag === "*" ||
      (begin.kind !== "recurrence" && sameTaskInboundFields(desired, remote))) return await finish("rejected");
    const accessToken = await deps.accessToken({ generation, calendarId });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await deps.fetch(url, { headers, redirect: "error" });
    if (!response.ok) return await finish("rejected"); // GET made no remote change.
    const observed = object(await response.json()) as GoogleEventResource;
    const shape = toTaskInboundFields(observed, timezone);
    if (observed.id !== eventId || observed.etag !== etag || observed.status === "cancelled" ||
        (observed.status !== undefined && observed.status !== "confirmed" && observed.status !== "tentative") ||
        observed.recurringEventId !== undefined || observed.originalStartTime !== undefined ||
        (observed.recurrence !== undefined && !Array.isArray(observed.recurrence)) ||
        !shape.ok || !sameTaskInboundFields(shape.fields, remote)) return await finish("rejected");
    sent = true;
    const written = await deps.fetch(url, { method: "PATCH", redirect: "error",
      headers: { ...headers, "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify(recurrence === undefined ? patch : { start: patch.start, end: patch.end, recurrence }) });
    if (written.status >= 400 && written.status < 500 && written.status !== 408) return await finish("rejected");
    if (!written.ok) return await finish("uncertain");
    const source = object(await written.json()) as GoogleEventResource;
    const result = inspectTaskOutboundResult({ eventId, fields: desired, timezone, allowRecurring: true }, source);
    if (result.kind !== "agree" || result.etag === etag || (recurrence !== undefined && !sameRecurrence(source.recurrence, recurrence))) return await finish("uncertain");
    return await finish("applied", source, result.base);
  } catch {
    // An unsuccessful settlement also stays held; never retry the external PATCH here.
    return await finish(sent ? "uncertain" : "rejected");
  }
}

async function runEventOperation(begin: Record<string, unknown>, operationId: string, deps: GoogleTaskOutboundDeps,
  finish: (outcome: "applied" | "rejected" | "uncertain", source?: unknown, fields?: unknown) => Promise<{ state: "completed" | "aborted" | "pending" }>) {
  let sent = false;
  try {
    const calendarId = text(begin.calendarId), eventId = text(begin.eventId), generation = text(begin.generation), timezone = text(begin.timezone);
    const access = await deps.accessToken({ generation, calendarId });
    const root = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const headers = { Authorization: `Bearer ${access}`, "Content-Type": "application/json" };
    if (begin.kind === "create") {
      const desired = fields(begin.fields), patch = toTaskSharedPatch(desired, timezone);
      const recurrence = taskRecurrence({ ...desired, ...object(begin.repeatTask ?? {}) }, timezone);
      if (!patch || !recurrence || !/^ff[0-9a-f]{32}$/.test(eventId)) return await finish("rejected");
      const clean = (value: object) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
      const body = { ...patch, start: clean(patch.start), end: clean(patch.end), id: eventId,
        ...(recurrence.length ? { recurrence } : {}), extendedProperties: { private: { focusflowOperation: operationId } } };
      sent = true;
      const response = await deps.fetch(root, { method: "POST", headers, redirect: "error", body: JSON.stringify(body) });
      if (!response.ok) return await finish("uncertain");
      const source = object(await response.json());
      const result = inspectTaskOutboundResult({ eventId, fields: desired, timezone, allowRecurring: true }, source);
      if (result.kind !== "agree" || !sameRecurrence(source.recurrence, recurrence) || !createdByOperation(source, operationId)) return await finish("uncertain");
      return await finish("applied", source, result.base);
    }
    const url = `${root}/${encodeURIComponent(eventId)}`;
    const response = await deps.fetch(url, { headers, redirect: "error" });
    if (response.status === 404 || response.status === 410) return await finish("applied", { id: eventId, status: "cancelled" });
    if (!response.ok) return await finish("rejected");
    const source = object(await response.json());
    if (source.id !== eventId || source.recurringEventId !== undefined || source.originalStartTime !== undefined) return await finish("rejected");
    if (source.status === "cancelled") return await finish("applied", source);
    const etag = text(source.etag);
    if (etag === "*" || etag !== object(begin.source).etag) return await finish("rejected");
    sent = true;
    const removed = await deps.fetch(url, { method: "DELETE", headers: { ...headers, "If-Match": etag }, redirect: "error" });
    if (removed.status === 412) return await finish("rejected");
    if (!removed.ok && removed.status !== 404 && removed.status !== 410) return await finish("uncertain");
    return await finish("applied", { ...source, status: "cancelled" });
  } catch { return await finish(sent ? "uncertain" : "rejected"); }
}
function createdByOperation(source: Record<string, unknown>, operationId: string): boolean {
  try { return object(object(source.extendedProperties).private).focusflowOperation === operationId; } catch { return false; }
}

/** Read-only remote recovery. A changed etag fences the old If-Match request; elapsed time does not. */
export async function reconcileGoogleTaskOutbound(userId: string, operationId: string, deps: GoogleTaskOutboundDeps): Promise<{ state: "completed" | "aborted" | "pending" }> {
  try {
    const op = object(await deps.rpc("read_google_task_outbound", { p_user_id: userId, p_operation_id: operationId }));
    if (op.state === "completed") return { state: "completed" };
    if (op.state !== "running" && op.state !== "uncertain") return { state: "pending" };
    const calendarId = text(op.calendarId), eventId = text(op.eventId), generation = text(op.generation);
    const desired = op.kind === "delete" ? null : fields(op.fields), timezone = text(op.timezone), dispatchId = text(op.dispatchId);
    const access = await deps.accessToken({ generation, calendarId });
    const response = await deps.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${access}` }, redirect: "error" });
    const absent = op.kind === "delete" && (response.status === 404 || response.status === 410);
    if (!response.ok && !absent) return { state: "pending" };
    const source = absent ? { id: eventId, status: "cancelled" } : object(await response.json());
    const result = desired ? inspectTaskOutboundResult({ eventId, fields: desired, timezone, allowRecurring: op.kind !== "create" }, source) : null;
    let outcome = "applied", agreed: unknown = result?.kind === "agree" ? result.base : null;
    if (source.id !== eventId || source.recurringEventId !== undefined || source.originalStartTime !== undefined) return { state: "pending" };
    if (op.kind === "delete") {
      if (source.status !== "cancelled") outcome = "superseded";
    } else if (op.kind === "create") {
      const shape = toTaskInboundFields(source, timezone);
      if (!createdByOperation(source, operationId) || !shape.ok || source.status === "cancelled") return { state: "pending" };
      outcome = "observed"; agreed = shape.fields;
    } else if (!result || result.kind !== "agree") outcome = "superseded";
    if (op.kind === "recurrence") {
      const recurrence = taskRecurrence({ ...desired!, ...object(op.repeatTask) }, timezone);
      if (!recurrence || !sameRecurrence(source.recurrence, recurrence)) outcome = "superseded";
    }
    if (op.kind !== "create" && !absent && source.status !== "cancelled" &&
      (typeof source.etag !== "string" || !source.etag || source.etag === "*" || source.etag === op.etag)) return { state: "pending" };
    if (outcome === "superseded") agreed = null;
    const args = { p_user_id: userId, p_operation_id: operationId, p_dispatch_id: dispatchId,
      p_outcome: outcome, p_source: source, p_fields: agreed };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const receipt = object(await deps.rpc("finish_google_task_outbound", args));
        if (receipt.finished === true && receipt.state === "completed") return { state: "completed" };
        if (receipt.finished === true && receipt.state === "aborted") return { state: "aborted" };
      } catch { /* Same positive observation and dispatch identity only. */ }
    }
  } catch { /* Missing access or observation never authorizes another PATCH. */ }
  return { state: "pending" };
}

/** Server adapter captures one user's verified grant and never accepts a Google token from a browser. */
export async function executeGoogleTaskOutbound(userId: string, operationId: string,
  fetchImpl: typeof fetch = fetch, env: ServiceRoleEnv = readServiceRoleEnv()) {
  const rpc = async (name: string, body: Record<string, unknown>): Promise<unknown> => {
    const response = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, { method: "POST", redirect: "error",
      headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body) });
    if (!response.ok) throw new GoogleTaskOutboundError();
    return response.json();
  };
  return runReservedGoogleTaskOutbound(userId, operationId, { rpc, fetch: fetchImpl, uuid: randomUUID,
    accessToken: async binding => {
      const stored = object(await rpc("read_google_binding_snapshot", { p_user_id: userId }));
      if (stored.generation !== binding.generation || stored.boundCalendarId !== binding.calendarId) throw new GoogleTaskOutboundError();
      const grant = await refreshAccessToken(text(stored.refreshToken), readGoogleOAuthEnv(), fetchImpl);
      const identity = await verifyGoogleIdentity(grant.accessToken, fetchImpl);
      if (identity.subject !== stored.subject) throw new GoogleTaskOutboundError();
      return grant.accessToken;
    },
  });
}
