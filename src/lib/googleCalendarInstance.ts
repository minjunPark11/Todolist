// Finding the Google id of ONE occurrence of a repeating event.
//
// RECURRING_OCCURRENCE_EDIT_DESIGN.md §7.1, M5. This is the piece
// `lib/ics/recurrence.ts` named when it marked expanded occurrences read-only:
//
//   "An occurrence has a synthetic id that exists only in this list, so a write
//    keyed by it finds nothing and vanishes. Editing one instance means
//    patching it through `events.instances`, which no caller does yet."
//
// Worse than vanishing, in fact. An expanded occurrence carries the MASTER's
// `externalUid`, so a write that used it would patch the whole series — the
// exact opposite of "this occurrence only". Nothing here may run until this
// module has answered with a real instance id.
//
// The inbound pass is left alone. It asks for `singleEvents=false` on purpose
// (the app owns expansion), and switching it would pull back hundreds of rows
// to serve an edit that happens once. So the instance is fetched at the moment
// of the edit and nowhere else.
import type { ExternalCalendarEvent } from "../types";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface InstanceLookupDeps {
  fetch: typeof fetch;
}

export interface InstanceLookupInput {
  /** The series master's Google id — an occurrence's `externalUid`. */
  masterId: string;
  /**
   * The instant the occurrence originally started, RFC3339 with an offset.
   * `originalStartTime` is what Google matches on, not where it was moved to.
   */
  originalStart: string;
  googleCalendarId: string;
  accessToken: string;
}

export type InstanceLookup =
  /** The occurrence's own id, which a PATCH or DELETE may be keyed by. */
  | { kind: "found"; instanceId: string; etag?: string }
  /** The series has no occurrence at that instant any more. */
  | { kind: "gone" }
  | { kind: "expired" }
  | { kind: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textAt(value: unknown, ...path: string[]): string {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return "";
    cursor = cursor[key];
  }
  return typeof cursor === "string" ? cursor : "";
}

/**
 * The instant `originalStart` names, as a number, or NaN.
 *
 * Compared as instants rather than as strings because Google answers in
 * whatever offset the calendar keeps and the caller may hold another. The same
 * moment written two ways is one occurrence, and a string compare would call
 * it two.
 */
function instant(value: string): number {
  return Date.parse(value);
}

/**
 * The occurrence of `masterId` that started at `originalStart`.
 *
 * A one-second window on either side, which is enough to name an instant
 * without matching its neighbour: no recurrence rule produces two occurrences
 * inside two seconds.
 */
export async function findGoogleInstance(
  input: InstanceLookupInput,
  deps: InstanceLookupDeps,
): Promise<InstanceLookup> {
  const target = instant(input.originalStart);
  if (!Number.isFinite(target) || !input.masterId) return { kind: "failed" };

  const params = new URLSearchParams({
    timeMin: new Date(target - 1000).toISOString(),
    timeMax: new Date(target + 1000).toISOString(),
    maxResults: "5",
    showDeleted: "true",
  });
  const path = `/calendars/${encodeURIComponent(input.googleCalendarId)}`
    + `/events/${encodeURIComponent(input.masterId)}/instances?${params.toString()}`;

  let response: Response;
  try {
    response = await deps.fetch(`${GOOGLE_CALENDAR_API}${path}`, {
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) return { kind: "expired" };
  if (response.status === 404 || response.status === 410) return { kind: "gone" };
  if (response.status !== 200) return { kind: "failed" };

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const items = Array.isArray(body?.items) ? body.items : [];

  for (const item of items) {
    if (!isRecord(item)) continue;
    // `originalStartTime` is the anchor. `start` is where the occurrence is
    // NOW, which for an already-moved one is a different day — matching on it
    // would miss exactly the occurrence someone is most likely editing again.
    const original = textAt(item, "originalStartTime", "dateTime")
      || textAt(item, "originalStartTime", "date");
    if (!original) continue;
    if (instant(original) !== target) continue;

    // A cancelled instance is the series' own EXDATE. There is nothing to
    // patch, and reporting it as found would send a write into a hole.
    if (textAt(item, "status") === "cancelled") return { kind: "gone" };

    const id = textAt(item, "id");
    if (!id) continue;
    const etag = textAt(item, "etag");
    return { kind: "found", instanceId: id, ...(etag ? { etag } : {}) };
  }
  return { kind: "gone" };
}

/**
 * Whether this record is an expanded occurrence rather than an event of its own.
 *
 * `occurrenceOf` is set by `expandIcsOccurrences` on what it produced, and by
 * nothing else — a master, a one-off, and an override Google sent us all lack
 * it. So it is the one question that decides whether a write needs an instance
 * lookup first.
 */
export function isExpandedOccurrence(event: Pick<ExternalCalendarEvent, "occurrenceOf">): boolean {
  return Boolean(event.occurrenceOf);
}
