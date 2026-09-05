// Sending the pass to Google (GOOGLE_CALENDAR_SYNC_DESIGN.md M1-5).
//
// `outboundPlan.ts` decided what to do; this does it, and reports back what the
// caller has to write down. It never touches app state itself — the mapping
// fields it earns come back as patches, so one failed write cannot leave a
// Task claiming an event that was not made.
//
// The order is not an accident: creates, then updates, then deletes, then
// orphans. A create that fails leaves no id and is simply retried next pass
// (§4.2); a delete that runs before its create would be a delete of nothing.
import {
  toGoogleEventBody,
  type SyncableTask,
} from "../domain/calendar/googleSync/eventShape";
import type { IdentifiedTask, OutboundPlan } from "../domain/calendar/googleSync/outboundPlan";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface OutboundDeps {
  fetch: typeof fetch;
}

/** What one task earned, to be written onto it. */
export interface EventMapping {
  taskId: string;
  googleEventId: string;
  googleEtag: string;
  /**
   * The Task's own `updatedAt` at the moment this write went out.
   *
   * Recorded even when the account won the conflict below: it says "we have
   * reconciled up to this local version", not "Google holds this". Without it
   * a losing edit would raise the same 412 on every pass forever.
   */
  googleSyncedAt: string;
}

export interface OutboundOutcome {
  /** Tasks that now point at an event, or point at a newer version of one. */
  mapped: EventMapping[];
  /**
   * Tasks whose mapping should be cleared.
   *
   * Two ways in. One is an ordinary delete: the task lost its date or went to
   * the trash, its event is gone, and the id it holds now names nothing. The
   * other is a write that came back 404 — Google saying, about this exact
   * event, that it is not there. Clearing the id makes the next pass CREATE it
   * again, which is the recovery; it never touches the task itself, because
   * inferring a deletion from our side is the one thing §7.1 forbids.
   */
  unlinked: string[];
  /** Orphans that are now really gone, and can leave the tombstone list. */
  clearedOrphans: string[];
  /** Writes that failed and will be tried again next pass. */
  failed: number;
  /**
   * The grant is dead — revoked in the Google account, or never completed.
   *
   * Everything after the first one would fail the same way, so the pass stops
   * and says so instead of spending a hundred requests proving it.
   */
  expired: boolean;
}

const EMPTY: OutboundOutcome = { mapped: [], unlinked: [], clearedOrphans: [], failed: 0, expired: false };

interface GoogleReply {
  status: number;
  body: Record<string, unknown> | null;
}

async function call(
  path: string,
  accessToken: string,
  deps: OutboundDeps,
  init: RequestInit = {},
): Promise<GoogleReply> {
  let response: Response;
  try {
    response = await deps.fetch(`${GOOGLE_CALENDAR_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    // A network failure is not a fact about the calendar. It counts as a
    // failure and changes nothing, which is what makes the pass safe to repeat.
    return { status: 0, body: null };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, body };
}

function events(calendarId: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}/events`;
}

function mappingFrom(task: IdentifiedTask, reply: GoogleReply): EventMapping | null {
  const id = reply.body?.id;
  if (typeof id !== "string" || !id) return null;
  const etag = typeof reply.body?.etag === "string" ? reply.body.etag : "";
  return { taskId: task.id, googleEventId: id, googleEtag: etag, googleSyncedAt: task.updatedAt ?? "" };
}

/** A delete that finds nothing has done its job — the event is not there. */
function deleteSucceeded(status: number): boolean {
  return (status >= 200 && status < 300) || status === 404 || status === 410;
}

export interface OutboundRequest {
  plan: OutboundPlan;
  calendarId: string;
  /** The zone the wall-clock times are written in (§9.2). */
  timezone: string;
  accessToken: string;
  deps?: OutboundDeps;
}

export async function runOutbound({
  plan,
  calendarId,
  timezone,
  accessToken,
  deps = { fetch: (input, init) => fetch(input, init) },
}: OutboundRequest): Promise<OutboundOutcome> {
  const outcome: OutboundOutcome = { ...EMPTY, mapped: [], unlinked: [], clearedOrphans: [] };
  const base = events(calendarId);

  for (const task of plan.create) {
    const reply = await call(base, accessToken, deps, {
      method: "POST",
      body: JSON.stringify(toGoogleEventBody(task as SyncableTask, timezone)),
    });
    if (reply.status === 401) return { ...outcome, expired: true };

    const mapping = mappingFrom(task, reply);
    if (mapping) outcome.mapped.push(mapping);
    else outcome.failed += 1;
  }

  for (const task of plan.update) {
    const result = await updateOne(task, base, timezone, accessToken, deps);
    if (result === "expired") return { ...outcome, expired: true };
    if (result === "failed") outcome.failed += 1;
    else if (result === "gone") outcome.unlinked.push(task.id);
    else if (result) outcome.mapped.push(result);
  }

  for (const { taskId, eventId } of plan.delete) {
    const reply = await call(`${base}/${encodeURIComponent(eventId)}`, accessToken, deps, { method: "DELETE" });
    if (reply.status === 401) return { ...outcome, expired: true };
    if (deleteSucceeded(reply.status)) outcome.unlinked.push(taskId);
    else outcome.failed += 1;
  }

  for (const eventId of plan.orphans) {
    const reply = await call(`${base}/${encodeURIComponent(eventId)}`, accessToken, deps, { method: "DELETE" });
    if (reply.status === 401) return { ...outcome, expired: true };
    // Only a real answer clears the tombstone. A network failure leaves the id
    // on the list, which is the whole reason the list exists (§4.3).
    if (deleteSucceeded(reply.status)) outcome.clearedOrphans.push(eventId);
    else outcome.failed += 1;
  }

  return outcome;
}

/**
 * One update, with the conflict rule attached (§5.3).
 *
 * `If-Match` on the stored etag, so a version we have not seen cannot be
 * silently clobbered. A 412 means Google holds something newer than what we
 * last agreed with, and last-write-wins decides between them: if the account's
 * `updated` is later than our `updatedAt`, THEIR edit is the winner and we take
 * the new etag rather than the event. M2 brings the change back in; until then
 * the important part is that M1 does not quietly destroy an edit made in
 * Google.
 */
async function updateOne(
  task: IdentifiedTask,
  base: string,
  timezone: string,
  accessToken: string,
  deps: OutboundDeps,
): Promise<EventMapping | "failed" | "gone" | "expired"> {
  const path = `${base}/${encodeURIComponent(task.googleEventId ?? "")}`;
  const body = JSON.stringify(toGoogleEventBody(task as SyncableTask, timezone));
  const ifMatch = task.googleEtag ? { "If-Match": task.googleEtag } : undefined;

  const first = await call(path, accessToken, deps, { method: "PATCH", body, ...(ifMatch ? { headers: ifMatch } : {}) });
  if (first.status === 401) return "expired";
  if (first.status === 404 || first.status === 410) return "gone";
  if (first.status !== 412) return mappingFrom(task, first) ?? "failed";

  const remote = await call(path, accessToken, deps);
  if (remote.status === 401) return "expired";
  if (remote.status === 404 || remote.status === 410) return "gone";

  const theirs = typeof remote.body?.updated === "string" ? remote.body.updated : "";
  const ours = task.updatedAt ?? "";
  if (theirs && ours && theirs > ours) {
    // They win. Storing their etag is not agreement with the content — it is
    // what stops the next pass from re-fighting the same conflict.
    const mapping = mappingFrom(task, remote);
    return mapping ?? "failed";
  }

  const retry = await call(path, accessToken, deps, { method: "PATCH", body });
  if (retry.status === 401) return "expired";
  if (retry.status === 404 || retry.status === 410) return "gone";
  return mappingFrom(task, retry) ?? "failed";
}
