// The zones a person may choose, and how to say one out loud.
//
// Not a curated list. A curated list is wrong for whoever is not on it, and
// the platform already ships the IANA database. `Intl.supportedValuesOf` is
// also the same set the engine will accept back, which is the property that
// matters here: every option this offers is one `normalizeAppSettings` keeps
// rather than quietly replacing with the device's zone.

/**
 * A last resort for an engine without `Intl.supportedValuesOf`.
 *
 * Deliberately short. It is not trying to be the database — the callers below
 * always add the zone in use and the zone the device reports, so the picker
 * can at minimum show what is selected and offer the way back to automatic.
 * Everything else here is a plausible guess at where a reader might be.
 */
const FALLBACK_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Pacific/Auckland",
];

/**
 * Every zone this engine knows, plus `include`, sorted by name.
 *
 * `include` is added unchecked, and that is on purpose. It carries the zone
 * the account currently holds, which `normalizeAppSettings` deliberately does
 * NOT validate — the IANA list moves and the account holds the only copy of
 * the choice (appSettingsTimezone.test.ts). A picker that dropped such a value
 * would show "Automatic" over an account that is not on automatic, which is
 * the one reading a settings screen must never allow. `timezoneLabel` degrades
 * to the bare name for it.
 *
 * Sorted by name and not by offset, and the labels below lead with the name
 * for the same reason: a native `<select>` jumps to the option whose TEXT
 * starts with what you type. Offset-first would make four hundred options
 * reachable only by scrolling.
 */
export function listTimezones(include: readonly string[] = []): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  let zones: string[];
  try {
    zones = supported ? supported("timeZone") : FALLBACK_ZONES;
  } catch {
    zones = FALLBACK_ZONES;
  }
  const all = new Set(zones);
  for (const zone of include) if (zone) all.add(zone);
  return [...all].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * `zone`'s offset from UTC at `at`, in minutes, or null if it has none here.
 *
 * Formats the instant into the zone and reads the result back as if it were
 * UTC; the difference between the two is the offset. `hourCycle: "h23"` rather
 * than `hour12: false` — on older engines the latter reports midnight as hour
 * 24 of a day number that has already rolled over, which puts the offset a
 * full day out. The same trap `externalEventShape.ts` documents.
 */
export function timezoneOffsetMinutes(zone: string, at: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    if (!Number.isFinite(asUtc)) return null;
    // Seconds are already matched above, so what is left is whole minutes.
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/** "Asia/Seoul (UTC+09:00)", or just the name when the offset is unreadable. */
export function timezoneLabel(zone: string, at: Date = new Date()): string {
  const minutes = timezoneOffsetMinutes(zone, at);
  if (minutes === null) return zone;
  const sign = minutes < 0 ? "-" : "+";
  const total = Math.abs(minutes);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${zone} (UTC${sign}${hh}:${mm})`;
}

/**
 * What choosing `value` in the picker writes to the account.
 *
 * Here rather than inline in the row so the one thing worth getting right is
 * testable without a settings screen: leaving "manual" must restore the
 * device's zone in the SAME write. The refresh effect would do it on the next
 * start anyway, and a screen reading "Automatic" over a stale city until then
 * is only a slower way of being wrong.
 *
 * A device that cannot name its own zone leaves the value alone: "" would
 * strand every reader that asks the account what day it is, and the old value
 * is at least an answer someone once had a reason for.
 */
export function timezoneChoicePatch(
  value: string,
  detected: string,
): { timezoneMode: "auto" | "manual"; timezone?: string } {
  if (value !== "auto") return { timezoneMode: "manual", timezone: value };
  return { timezoneMode: "auto", ...(detected ? { timezone: detected } : {}) };
}
