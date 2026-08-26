// How a day column's header reads, per locale.
//
// CALENDAR_GEOMETRY_DESIGN.md R3. Two facts pull against each other:
//
//   - Korean writes the day first and decorates it — "26일 (수)" — and the
//     suffix and parentheses are part of the date, not separators we invented.
//   - Calendar.app's English header is "Wed 26", which is NOT what CLDR's `Ed`
//     skeleton gives (`d E` → "26 Wed"). Apple uses its own template there.
//
// So neither "always ask Intl" nor "always weekday first" is right on its own.
// The rule below asks Intl for the pieces every time, and only decides the order
// when the locale has expressed no opinion beyond a space.

/**
 * The header's parts, in the order the header should read them.
 *
 * A locale that separates weekday and day with nothing but whitespace gets
 * Apple's order — weekday first. A locale that decorates the number keeps its
 * own arrangement, because that arrangement is carrying the decoration.
 */
export function dayHeadParts(formatter: Intl.DateTimeFormat, date: Date): Intl.DateTimeFormatPart[] {
  const parts = formatter.formatToParts(date);
  const decorated = parts.some((part) => part.type === "literal" && part.value.trim() !== "");
  if (decorated) return parts;
  const weekday = parts.find((part) => part.type === "weekday");
  const day = parts.find((part) => part.type === "day");
  if (!weekday || !day) return parts;
  return [weekday, { type: "literal", value: " " }, day];
}

/** The formatter the header is built from. */
export function dayHeadFormatter(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" });
}
