// Sending one external event's edit back to Google
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2, §5.3).
//
// The third writer in this feature, and the smallest. `googleCalendarOutbound`
// writes Tasks as events; this writes an event that was already an event, which
// is the whole difference between M1 and two-way.
//
// The conflict rule is the outbound one, deliberately: `If-Match` on the etag
// we last saw, and on 412 the newer `updated` wins. Two writers with two
// different rules over one calendar is how a calendar loses an edit nobody can
// account for afterwards.
import {
  toGoogleEventPatch,
  type ExternalEventEdit,
} from "../domain/calendar/googleSync/externalEventShape";
import { findGoogleInstance, isExpandedOccurrence } from "./googleCalendarInstance";
import type { ExternalCalendarEvent } from "../types";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface EventWriteDeps {
  fetch: typeof fetch;
}

export type EventWriteResult =
  /** Written. The new etag, so the next write and the echo check both work. */
  | { kind: "written"; etag?: string; updated?: string }
  /** Google holds a newer version and it wins (§5.3). Ours is not sent. */
  | { kind: "superseded"; etag?: string }
  /** The event is not there any more. The next inbound pass will tidy up. */
  | { kind: "gone" }
  /** The grant is dead. */
  | { kind: "expired" }
  /** Nothing to send — the edit changed nothing. */
  | { kind: "unchanged" }
  | { kind: "failed" };

interface Reply {
  status: number;
  body: Record<string, unknown> | null;
}

async function call(path: string, accessToken: string, deps: EventWriteDeps, init: RequestInit = {}): Promise<Reply> {
  let response: Response;
  try {
    response = await deps.fetch(`${GOOGLE_CALENDAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return { status: 0, body: null };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, body };
}

function textOf(body: Record<string, unknown> | null, key: string): string | undefined {
  const value = body?.[key];
  return typeof value === "string" && value ? value : undefined;
}

export interface WriteEventInput {
  event: ExternalCalendarEvent;
  edit: ExternalEventEdit;
  /** Google's id for the calendar the event lives in. */
  googleCalendarId: string;
  accessToken: string;
}

/**
 * One edit, sent.
 *
 * A 412 is not a failure: it means Google moved since we last read, and the
 * answer is to ask what it holds and compare. If theirs is newer, ours is
 * dropped — the same last-write-wins the outbound pass applies, and the reason
 * a calendar edited from two places does not lose an edit silently.
 */
export async function writeExternalEvent(
  { event, edit, googleCalendarId, accessToken }: WriteEventInput,
  deps: EventWriteDeps,
): Promise<EventWriteResult> {
  const patch = toGoogleEventPatch(event, edit);
  if (!patch) return { kind: "unchanged" };

  // One occurrence of a series is not addressable by the series' id. An
  // expanded occurrence carries the MASTER's `externalUid` — writing to it
  // would edit every occurrence, which is the opposite of what a click on one
  // of them means. So the real instance id is fetched first, and only then is
  // anything sent (§7.1, M5).
  let targetId = event.externalUid;
  let targetEtag = event.etag;
  if (isExpandedOccurrence(event)) {
    const found = await findGoogleInstance({
      masterId: event.externalUid,
      // Where it WAS. `recurrenceId` is that date on an override; on a plain
      // expanded occurrence the start it was generated at is the same instant.
      originalStart: event.recurrenceId || event.start,
      googleCalendarId,
      accessToken,
    }, deps);
    if (found.kind !== "found") return found.kind === "gone" ? { kind: "gone" } : { kind: found.kind };
    targetId = found.instanceId;
    // The instance's own etag, not the master's. The master's would fail the
    // If-Match against a record it does not describe.
    targetEtag = found.etag;
  }

  const path = `/calendars/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(targetId)}`;
  const body = JSON.stringify(patch);
  const ifMatch = targetEtag ? { "If-Match": targetEtag } : undefined;

  const first = await call(path, accessToken, deps, {
    method: "PATCH",
    body,
    ...(ifMatch ? { headers: ifMatch } : {}),
  });
  if (first.status === 401) return { kind: "expired" };
  if (first.status === 404 || first.status === 410) return { kind: "gone" };
  if (first.status === 200) {
    return {
      kind: "written",
      ...(textOf(first.body, "etag") ? { etag: textOf(first.body, "etag") } : {}),
      ...(textOf(first.body, "updated") ? { updated: textOf(first.body, "updated") } : {}),
    };
  }
  if (first.status !== 412) return { kind: "failed" };

  const remote = await call(path, accessToken, deps);
  if (remote.status === 401) return { kind: "expired" };
  if (remote.status === 404 || remote.status === 410) return { kind: "gone" };
  if (remote.status !== 200) return { kind: "failed" };

  const theirs = textOf(remote.body, "updated") ?? "";
  const ours = event.updatedAt ?? "";
  if (theirs && ours && theirs > ours) {
    // Their edit is newer. Taking the etag is not agreement with the content —
    // it is what stops the next write from re-fighting the same conflict.
    return { kind: "superseded", ...(textOf(remote.body, "etag") ? { etag: textOf(remote.body, "etag") } : {}) };
  }

  const retry = await call(path, accessToken, deps, { method: "PATCH", body });
  if (retry.status === 401) return { kind: "expired" };
  if (retry.status === 404 || retry.status === 410) return { kind: "gone" };
  if (retry.status !== 200) return { kind: "failed" };
  return {
    kind: "written",
    ...(textOf(retry.body, "etag") ? { etag: textOf(retry.body, "etag") } : {}),
    ...(textOf(retry.body, "updated") ? { updated: textOf(retry.body, "updated") } : {}),
  };
}

/**
 * One event, deleted.
 *
 * No `If-Match`: a delete is not a merge, and refusing it because somebody
 * renamed the event first would be a confusing way to fail. 404 and 410 are
 * successes — the event is gone, which is what was asked for.
 */
export async function deleteExternalEvent(
  { event, googleCalendarId, accessToken }: Omit<WriteEventInput, "edit">,
  deps: EventWriteDeps,
): Promise<EventWriteResult> {
  const path = `/calendars/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(event.externalUid)}`;
  const reply = await call(path, accessToken, deps, { method: "DELETE" });
  if (reply.status === 401) return { kind: "expired" };
  if (reply.status === 404 || reply.status === 410 || (reply.status >= 200 && reply.status < 300)) {
    return { kind: "gone" };
  }
  return { kind: "failed" };
}
