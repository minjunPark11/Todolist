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

export interface TimezoneOption {
  /** What gets stored. A zone name, or a caller's own token such as "auto". */
  value: string;
  /** What the reader sees and types against. */
  label: string;
}

/**
 * One option, split into the two things a query can be about.
 *
 * They are matched differently on purpose. A name is matched as a substring,
 * because "sha" should find Shanghai. An offset must NOT be: "+1" is a
 * substring of "+10:00", "+11:00" and "+12:00", so a reader asking for
 * central Europe would be handed half of Asia.
 *
 * The offsets are listed in the spellings a person actually types. The label
 * already carries "(UTC+08:00)", but "+8", "utc+8" and "gmt+8" are all things
 * someone reaching for Shanghai will write, and none is derivable from the
 * others by substring. Cheap to list; guessing which was meant is not.
 */
function searchText(option: TimezoneOption): { text: string; offsets: Set<string> } {
  const text = normalize(`${option.value} ${option.label}`);
  const offsets = new Set<string>();
  const minutes = timezoneOffsetMinutes(option.value);
  if (minutes !== null) {
    const sign = minutes < 0 ? "-" : "+";
    const total = Math.abs(minutes);
    const hours = Math.floor(total / 60);
    const mm = total % 60;
    const forms = [`${sign}${String(hours).padStart(2, "0")}:${String(mm).padStart(2, "0")}`];
    // A bare hour only when there are no minutes to lose. "+5" must not stand
    // for +05:30, or a reader who meant Lima would be shown Delhi.
    if (mm) forms.push(`${sign}${hours}:${mm}`);
    else forms.push(`${sign}${hours}`, `${sign}${String(hours).padStart(2, "0")}`);
    for (const form of forms) offsets.add(form).add(`utc${form}`).add(`gmt${form}`);
  }
  return { text, offsets };
}

/** Lowercase, with the punctuation nobody types turned into gaps. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[_/(),]/g, " ").replace(/\s+/g, " ").trim();
}

/** A query piece that is asking about an offset rather than about a name. */
function isOffsetQuery(token: string): boolean {
  return /^(?:utc|gmt)?[+-]\d/.test(token);
}

/**
 * The options `query` matches, in the order they were given.
 *
 * Every whitespace-separated piece of the query has to match, so "asia sha"
 * and "sha asia" both work and neither depends on remembering which half of
 * the name comes first. An empty query matches everything — an unfiltered list
 * is the right answer to "you have not asked yet", not an empty one.
 */
export function filterTimezoneOptions<T extends TimezoneOption>(options: readonly T[], query: string): T[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return [...options];
  return options.filter((option) => {
    const { text, offsets } = searchText(option);
    return tokens.every((token) => (isOffsetQuery(token) ? offsets.has(token) : text.includes(token)));
  });
}
