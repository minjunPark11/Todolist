// A List's colour, read from the one string that stores it.
//
// §13.21 recommends two columns, `color_kind` and `color_value`, and §13.23
// gives the reason: easier queries, clearer constraints, simpler migrations.
// None of those three apply here — this app stores one `data` jsonb per row,
// so there are no columns to be relational about, and "two columns" would mean
// two fields inside one object.
//
// That trade is worth stating because it inverts. Two fields can DISAGREE:
// `kind: "preset"` beside `value: "#4F7AF8"` is representable and meaningless,
// which is exactly why §13.22 has to state a constraint at all. One string
// cannot disagree with itself, and it can still say all three things, because
// a preset key never begins with `#`.
//
// So `List.color` holds "", a preset key, or `#RRGGBB`, and this file is the
// only thing that reads it.
export type ListColorKind = "none" | "preset" | "custom";

/** §13.20's eight, and their hex — the app has no colour table to look them up in. */
export const LIST_COLOR_PRESETS = [
  { key: "red", hex: "#e5484d" },
  { key: "orange", hex: "#f76b15" },
  { key: "yellow", hex: "#ffb224" },
  { key: "lime", hex: "#99d52a" },
  { key: "green", hex: "#30a46c" },
  { key: "blue", hex: "#0a84ff" },
  { key: "indigo", hex: "#5b5bd6" },
  { key: "purple", hex: "#8e4ec6" },
] as const;

export type ListColorPresetKey = (typeof LIST_COLOR_PRESETS)[number]["key"];

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ListColor {
  kind: ListColorKind;
  /** Exactly what is stored, so a round trip through here changes nothing. */
  stored: string;
  /** What to paint, or "" when this build cannot paint it. */
  hex: string;
}

/**
 * Reads the stored value.
 *
 * A value this build does not recognise resolves to `none` — it is not
 * drawable, and guessing at a colour is worse than showing none. It is NOT
 * removed: `sanitizeList` keeps it (Phase 1), so a preset added in a later
 * release survives a round trip through this client and paints again on one
 * that knows it.
 */
export function parseListColor(stored: string | undefined): ListColor {
  const value = (stored ?? "").trim();
  if (!value) return { kind: "none", stored: "", hex: "" };

  const preset = LIST_COLOR_PRESETS.find((entry) => entry.key === value);
  if (preset) return { kind: "preset", stored: value, hex: preset.hex };

  if (HEX.test(value)) return { kind: "custom", stored: value, hex: value.toLowerCase() };

  return { kind: "none", stored: value, hex: "" };
}

/** §13.22's custom half, for the field that accepts one. */
export function isCustomListColor(value: string): boolean {
  return HEX.test(value.trim());
}

/** What the sidebar and the picker paint, or "" to paint nothing. */
export function listColorHex(stored: string | undefined): string {
  return parseListColor(stored).hex;
}
