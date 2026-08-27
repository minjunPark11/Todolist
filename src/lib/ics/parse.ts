// ICS parsing, with nothing under it.
//
// Moved out of `lib/externalCalendars.ts` unchanged in behaviour. That module
// reaches for `platform` — storage, fetch — which makes it unusable anywhere
// there is no browser. This half never touches one, so the same parser can run
// in the app and on a server, and the two cannot drift into two answers
// (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md §5, §7.2).
//
// What this file does NOT do is expand a repeating event into its occurrences.
// It reads `RRULE`/`EXDATE`/`RECURRENCE-ID` off the record and stops there;
// turning them into dates is `./recurrence`, because that needs a range to
// expand within and this needs none.
import type { ExternalCalendarEvent, IcsRecurrence } from "../../types";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function unfoldIcsLines(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

export function unescapeIcsText(value = "") {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function getIcsValue(lines: string[], name: string) {
  const property = getIcsProperty(lines, name);
  return property?.value ?? "";
}

type IcsProperty = { value: string; params: Map<string, string> };

function readIcsProperty(line: string): IcsProperty | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const params = new Map<string, string>();
  for (const part of head.split(";").slice(1)) {
    const equals = part.indexOf("=");
    if (equals < 0) continue;
    params.set(part.slice(0, equals).toUpperCase(), part.slice(equals + 1).replace(/^"|"$/g, ""));
  }
  return { value: line.slice(colon + 1), params };
}

function matchesProperty(line: string, name: string) {
  const upper = line.toUpperCase();
  return upper.startsWith(`${name}:`) || upper.startsWith(`${name};`);
}

function getIcsProperty(lines: string[], name: string) {
  const prefix = name.toUpperCase();
  const line = lines.find((item) => matchesProperty(item, prefix));
  return line ? readIcsProperty(line) : null;
}

/**
 * Every line for a property, not just the first.
 *
 * `EXDATE` is why this exists: a calendar that has had three occurrences
 * cancelled may write three EXDATE lines, and the single-line reader would
 * have resurrected two of those meetings.
 */
function getIcsProperties(lines: string[], name: string): IcsProperty[] {
  const prefix = name.toUpperCase();
  return lines
    .filter((item) => matchesProperty(item, prefix))
    .map(readIcsProperty)
    .filter((item): item is IcsProperty => item !== null);
}

export function parseIcsDate(value: string, timezone?: string) {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    return { value: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, allDay: true, timezone: undefined };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00", z] = match;
  const iso = z
    ? new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString()
    : `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  return { value: iso, allDay: false, timezone };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * UTC ("...Z") stamps are converted to the source calendar's timezone when
 * available, otherwise to `fallbackTimezone`, otherwise to the device's local
 * date/time. Floating TZID values are already in the source calendar's wall
 * time, so they are taken as-is.
 *
 * `fallbackTimezone` is what makes this usable off a device: on a server there
 * is no meaningful "local", and reading a UTC stamp as the server's zone would
 * put a 9 a.m. meeting on the wrong day for anyone east of it. Callers with a
 * viewer in hand pass that viewer's zone.
 */
export function localDateTimeParts(
  value: string,
  timezone?: string,
  fallbackTimezone?: string,
): { date: string; time?: string } {
  if (!value.includes("T")) return { date: value.slice(0, 10) };
  if (value.endsWith("Z")) {
    const date = new Date(value);
    const zone = timezone || fallbackTimezone;
    if (zone) {
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          hourCycle: "h23",
        })
          .formatToParts(date)
          .reduce<Record<string, string>>((acc, part) => {
            if (part.type !== "literal") acc[part.type] = part.value;
            return acc;
          }, {});
        return {
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}`,
        };
      } catch {
        // Unknown/non-IANA TZID: fall back to device local handling.
      }
    }
    return {
      date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
    };
  }
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

/**
 * `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T000000Z`
 *
 * Only the parts real calendars emit for the shapes people actually make
 * (§9.2.1). An unsupported part is ignored rather than rejected — dropping the
 * whole rule would hide the meeting entirely, and showing it on slightly the
 * wrong days is the smaller error. `BYSETPOS` is the one that can be badly
 * wrong, so a rule carrying it is refused outright and the event stays a
 * single occurrence.
 */
export function parseRRule(value: string, timezone?: string): IcsRecurrence | null {
  if (!value) return null;
  const parts = new Map<string, string>();
  for (const chunk of value.split(";")) {
    const equals = chunk.indexOf("=");
    if (equals < 0) continue;
    parts.set(chunk.slice(0, equals).trim().toUpperCase(), chunk.slice(equals + 1).trim());
  }

  const freq = parts.get("FREQ")?.toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  // "the 3rd Tuesday" and friends. Expanding these without BYSETPOS support
  // would put the meeting on every Tuesday of the month.
  if (parts.has("BYSETPOS")) return null;

  const interval = Number.parseInt(parts.get("INTERVAL") ?? "1", 10);
  const count = parts.has("COUNT") ? Number.parseInt(parts.get("COUNT") ?? "", 10) : undefined;
  const byDay = parts
    .get("BYDAY")
    ?.split(",")
    .map((day) => day.trim().toUpperCase())
    // An ordinal prefix ("2MO") is the BYSETPOS problem in another spelling.
    .filter((day) => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(day));
  const byMonthDay = parts
    .get("BYMONTHDAY")
    ?.split(",")
    .map((day) => Number.parseInt(day.trim(), 10))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);

  return {
    freq,
    interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
    count: Number.isInteger(count) && (count as number) > 0 ? count : undefined,
    // Normalised here rather than carried raw, so nothing downstream has to
    // know that UNTIL comes in two shapes.
    until: parseIcsDate(parts.get("UNTIL") ?? "", timezone)?.value,
    byDay: byDay?.length ? byDay : undefined,
    byMonthDay: byMonthDay?.length ? byMonthDay : undefined,
  };
}

/**
 * The VEVENTs in an ICS document, one record each.
 *
 * A repeating event stays ONE record here, carrying its rule — see the file
 * header. An occurrence that was edited on its own arrives as a second VEVENT
 * with the same UID and a `RECURRENCE-ID`; it is returned too, marked, for
 * `./recurrence` to slot into place.
 */
export function parseIcsEvents(text: string, calendarId: string): ExternalCalendarEvent[] {
  const lines = unfoldIcsLines(text);
  const calendarTimezone = getIcsValue(lines, "X-WR-TIMEZONE") || getIcsValue(lines, "TZID") || undefined;
  const now = new Date().toISOString();
  const events: ExternalCalendarEvent[] = [];
  let block: string[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      block = [];
      continue;
    }
    if (line === "END:VEVENT" && block) {
      const uid = getIcsValue(block, "UID") || createId("ics-event");
      const startProperty = getIcsProperty(block, "DTSTART");
      const startTimezone = startProperty?.params.get("TZID") || calendarTimezone;
      const start = parseIcsDate(startProperty?.value ?? "", startTimezone);
      if (!start) {
        block = null;
        continue;
      }
      const endProperty = getIcsProperty(block, "DTEND");
      const endTimezone = endProperty?.params.get("TZID") || start.timezone;
      const end = parseIcsDate(endProperty?.value ?? "", endTimezone);

      const recurrence = parseRRule(getIcsValue(block, "RRULE"), startTimezone);
      // One line may carry several dates ("EXDATE:20260101T090000,20260108T090000"),
      // and there may be several lines.
      const exdates = getIcsProperties(block, "EXDATE").flatMap((property) =>
        property.value
          .split(",")
          .map((item) => parseIcsDate(item.trim(), property.params.get("TZID") || startTimezone)?.value)
          .filter((item): item is string => Boolean(item)),
      );
      const recurrenceIdProperty = getIcsProperty(block, "RECURRENCE-ID");
      const recurrenceId = recurrenceIdProperty
        ? parseIcsDate(recurrenceIdProperty.value, recurrenceIdProperty.params.get("TZID") || startTimezone)?.value
        : undefined;

      events.push({
        // A repeating event's occurrences all share this id until
        // `./recurrence` gives each its own; an edited occurrence would
        // otherwise collide with its own master, which is a bug this file
        // inherited rather than introduced.
        id: `${calendarId}:${uid}`,
        externalCalendarId: calendarId,
        externalUid: uid,
        title: unescapeIcsText(getIcsValue(block, "SUMMARY")) || "Untitled event",
        description: unescapeIcsText(getIcsValue(block, "DESCRIPTION")),
        location: unescapeIcsText(getIcsValue(block, "LOCATION")),
        start: start.value,
        end: end?.value,
        allDay: start.allDay,
        timezone: start.timezone,
        sourceUrl: getIcsValue(block, "URL"),
        readOnly: true,
        createdAt: now,
        updatedAt: now,
        ...(recurrence ? { recurrence } : {}),
        ...(exdates.length ? { exdates } : {}),
        ...(recurrenceId ? { recurrenceId } : {}),
      });
      block = null;
      continue;
    }
    if (block) block.push(line);
  }

  return events;
}

export function externalEventDate(event: ExternalCalendarEvent, viewerTimezone?: string) {
  return localDateTimeParts(event.start, event.timezone, viewerTimezone).date;
}

// End date (exclusive for all-day events per RFC 5545), or undefined.
export function externalEventEndDate(event: ExternalCalendarEvent, viewerTimezone?: string) {
  return event.end ? localDateTimeParts(event.end, event.timezone, viewerTimezone).date : undefined;
}

export function externalEventStartTime(event: ExternalCalendarEvent, viewerTimezone?: string) {
  return event.allDay ? undefined : localDateTimeParts(event.start, event.timezone, viewerTimezone).time;
}

export function externalEventEndTime(event: ExternalCalendarEvent, viewerTimezone?: string) {
  return event.allDay || !event.end ? undefined : localDateTimeParts(event.end, event.timezone, viewerTimezone).time;
}
