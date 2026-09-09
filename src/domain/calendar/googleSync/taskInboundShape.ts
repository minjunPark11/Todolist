import { isLocalDate } from "../../schedule/types";
import type { GoogleEventResource } from "./inboundShape";

/** Only these fields may be patched by inbound sync. No app-owned metadata. */
export interface TaskInboundFields {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  startTime: string;
  endTime: string;
}

export function normalizeTaskInboundFields(fields: TaskInboundFields): TaskInboundFields {
  return {
    title: fields.title.trim() ? fields.title : "(제목 없음)",
    description: fields.description.replace(/\r\n?/g, "\n"),
    startDate: fields.startDate === fields.dueDate ? "" : fields.startDate,
    dueDate: fields.dueDate,
    startTime: fields.startTime,
    endTime: fields.endTime,
  };
}

export function sameTaskInboundFields(a: TaskInboundFields, b: TaskInboundFields): boolean {
  return JSON.stringify(normalizeTaskInboundFields(a)) === JSON.stringify(normalizeTaskInboundFields(b));
}

export type TaskInboundShape =
  | { ok: true; fields: TaskInboundFields }
  | { ok: false; reason: "invalid-event" | "unsupported-schedule" };

// Explicit offsets only: parsing an offset-free value must never use the device zone.
function instant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00(?:\.0+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  if (!isLocalDate(value.slice(0, 10))) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function wallFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
}

function wall(ms: number, formatter: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(formatter.formatToParts(ms).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date, time, stamp: Date.parse(`${date}T${time}:${parts.second}Z`) };
}

/** A fold has two instants for one wall time; the current outbound shape loses that distinction. */
function ambiguous(ms: number, formatter: Intl.DateTimeFormat): boolean {
  const target = wall(ms, formatter).stamp;
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = ms + hours * 3_600_000;
    const offset = wall(sample, formatter).stamp - sample;
    const candidate = target - offset;
    if (candidate !== ms && wall(candidate, formatter).stamp === target) return true;
  }
  return false;
}

/** Lossless within the current outbound schedule model; unsupported values are never truncated. */
export function toTaskInboundFields(item: GoogleEventResource, timezone: string): TaskInboundShape {
  if ((item.summary != null && typeof item.summary !== "string") ||
      (item.description != null && typeof item.description !== "string")) {
    return { ok: false, reason: "invalid-event" };
  }
  const content = {
    title: typeof item.summary === "string" ? item.summary : "",
    description: typeof item.description === "string" ? item.description : "",
  };
  const start = item.start;
  const end = item.end;
  if (start?.date !== undefined || end?.date !== undefined) {
    if (!isLocalDate(start?.date) || !isLocalDate(end?.date) ||
        start?.dateTime !== undefined || end?.dateTime !== undefined || end.date <= start.date) {
      return { ok: false, reason: "invalid-event" };
    }
    const dueDate = new Date(Date.parse(`${end.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    return { ok: true, fields: normalizeTaskInboundFields({ ...content,
      startDate: start.date, dueDate, startTime: "", endTime: "",
    }) };
  }
  const from = instant(start?.dateTime);
  const to = instant(end?.dateTime);
  if (from === null || to === null || to <= from) return { ok: false, reason: "unsupported-schedule" };
  try {
    const formatter = wallFormatter(timezone);
    const a = wall(from, formatter);
    const b = wall(to, formatter);
    if (a.stamp % 60_000 !== 0 || b.stamp % 60_000 !== 0 ||
        a.date !== b.date || a.time >= b.time || ambiguous(from, formatter) || ambiguous(to, formatter)) {
      return { ok: false, reason: "unsupported-schedule" };
    }
    return { ok: true, fields: normalizeTaskInboundFields({ ...content,
      startDate: "", dueDate: a.date, startTime: a.time, endTime: b.time,
    }) };
  } catch {
    return { ok: false, reason: "unsupported-schedule" };
  }
}
