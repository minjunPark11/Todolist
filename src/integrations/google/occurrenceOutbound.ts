import { matchesOccurrence } from "../../lib/googleOccurrenceSync";
import { sameTaskInboundFields, toTaskInboundFields, type TaskInboundFields } from "../../domain/calendar/googleSync/taskInboundShape";
import { toTaskSharedPatch } from "../../domain/calendar/googleSync/taskOutboundPlan";
import type { GoogleTaskOutboundDeps } from "./taskOutbound";

type Result = { state: "completed" | "aborted" | "pending" };
type Finish = (outcome: "applied" | "rejected" | "uncertain", source?: unknown, fields?: unknown) => Promise<Result>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid occurrence response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Missing occurrence identity.");
  return value;
}
function address(op: Record<string, unknown>) {
  return { master: text(op.masterEventId), original: text(op.originalStart), eventId: text(op.eventId),
    calendarId: text(op.calendarId), generation: text(op.generation), timezone: text(op.timezone) };
}
function agreed(op: Record<string, unknown>, source: Record<string, unknown>) {
  const shape = toTaskInboundFields(source, text(op.timezone));
  return shape.ok && sameTaskInboundFields(shape.fields, op.fields as TaskInboundFields) ? shape.fields : null;
}

/** No create, no master write, no repeat-rule body, and one conditional mutation per reservation. */
export async function runOccurrenceOperation(op: Record<string, unknown>, deps: GoogleTaskOutboundDeps, finish: Finish): Promise<Result> {
  let sent = false;
  try {
    const a = address(op), reserved = record(op.source), etag = typeof reserved.etag === "string" ? reserved.etag : "";
    if (etag === "*" || reserved.id !== a.eventId || !matchesOccurrence(reserved, a.master, a.original)) return await finish("rejected");
    const access = await deps.accessToken(a);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(a.calendarId)}/events/${encodeURIComponent(a.eventId)}`;
    const headers = { Authorization: `Bearer ${access}`, "Content-Type": "application/json" };
    const read = await deps.fetch(url, { headers, redirect: "error" });
    if (!read.ok) return await finish("rejected");
    const source = record(await read.json());
    if (source.id !== a.eventId || !matchesOccurrence(source, a.master, a.original)) return await finish("rejected");
    const normalized = (value: Record<string, unknown>) => ({ ...value, originalStartTime: reserved.originalStartTime });
    if (op.kind === "occurrence-delete" && source.status === "cancelled") return await finish("applied", normalized(source));
    if (!etag || source.etag !== etag || source.status === "cancelled") return await finish("rejected");
    const remote = toTaskInboundFields(source, a.timezone);
    if (!remote.ok || !sameTaskInboundFields(remote.fields, op.remote as TaskInboundFields)) return await finish("rejected");
    const patch = op.kind === "occurrence-patch" ? toTaskSharedPatch(op.fields as TaskInboundFields, a.timezone) : null;
    if (op.kind === "occurrence-patch" && !patch) return await finish("rejected");
    sent = true;
    const write = await deps.fetch(url, { method: patch ? "PATCH" : "DELETE", redirect: "error",
      headers: { ...headers, "If-Match": etag }, ...(patch ? { body: JSON.stringify(patch) } : {}) });
    if (write.status >= 400 && write.status < 500 && write.status !== 408) return await finish("rejected");
    if (!write.ok) return await finish("uncertain");
    if (!patch) return await finish("applied", normalized({ ...source, status: "cancelled" }));
    const result = record(await write.json());
    if (result.id !== a.eventId || !matchesOccurrence(result, a.master, a.original) || result.status === "cancelled" ||
      typeof result.etag !== "string" || !result.etag || result.etag === "*" || result.etag === etag) return await finish("uncertain");
    const base = agreed(op, result);
    return base ? await finish("applied", normalized(result), base) : await finish("uncertain");
  } catch { return finish(sent ? "uncertain" : "rejected"); }
}

/** Recovery only observes. An unchanged etag cannot prove that an in-flight request is finished. */
export async function reconcileOccurrenceOperation(userId: string, operationId: string, op: Record<string, unknown>, deps: GoogleTaskOutboundDeps): Promise<Result> {
  const a = address(op), access = await deps.accessToken(a);
  const response = await deps.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(a.calendarId)}/events/${encodeURIComponent(a.eventId)}`,
    { headers: { Authorization: `Bearer ${access}` }, redirect: "error" });
  // Even a 404 can be transient. Keep the durable reservation until a cancellation/version is observed.
  if (!response.ok) return { state: "pending" };
  const source = record(await response.json());
  if (source.id !== a.eventId || !matchesOccurrence(source, a.master, a.original)) return { state: "pending" };
  const cancelled = source.status === "cancelled";
  if (!(op.kind === "occurrence-delete" && cancelled) &&
    (typeof source.etag !== "string" || !source.etag || source.etag === "*" || source.etag === op.etag)) return { state: "pending" };
  const fields = !cancelled && op.kind === "occurrence-patch" ? agreed(op, source) : null;
  const outcome = op.kind === "occurrence-delete" ? (cancelled ? "applied" : "superseded") : (fields ? "applied" : "superseded");
  const saved = record(op.source);
  const args = { p_user_id: userId, p_operation_id: operationId, p_dispatch_id: text(op.dispatchId), p_outcome: outcome,
    p_source: { ...source, originalStartTime: saved.originalStartTime }, p_fields: fields };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = record(await deps.rpc("finish_google_task_outbound", args));
      if (result.finished === true && (result.state === "completed" || result.state === "aborted")) return { state: result.state };
    } catch { /* Retry the same receipt, never the Google mutation. */ }
  }
  return { state: "pending" };
}
