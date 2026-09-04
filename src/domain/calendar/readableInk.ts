// Which ink reads on a filled event block (CALENDAR_TASK_CHECKBOX_DESIGN.md §3.4).
//
// The blocks used to be a 14% tint of the category colour, so the text sat on
// something near the canvas and could be the colour itself. D3-D fills the
// open ones with the colour at full strength, and then one fixed ink is not
// enough: white clears 4.5:1 on two of the eight palette colours and fails on
// the other six — but black clears it on all six, by 5.08 at worst. So the
// fill is not the problem the contrast table describes; a single ink is.
//
// CSS cannot make this choice — `color-contrast()` has no support to speak of
// — so it is made here, where the colour is already known, and handed to the
// stylesheet as a value.
//
// Block text is 11px and 10px, so 4.5:1 is the bar; the 3:1 large-text
// exception is not available to it.

/** sRGB channel → linear light (WCAG 2.x relative luminance). */
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  // Both spellings, because a category colour can arrive from a `<input
  // type="color">` (always 6) or from a hand-written seed (sometimes 3).
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Relative luminance of a hex colour, or `null` if it is not one.
 *
 * Exported for the contrast helper below and for the tests that check the
 * palette; nothing else should need it.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours; 1 when either is unreadable. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return 1;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The two inks a block may be given. Named, not hex, so themes can differ. */
export type BlockInk = "light" | "dark";

/** What `"light"` and `"dark"` actually paint, kept with the decision. */
export const BLOCK_INK_LIGHT = "#ffffff";
export const BLOCK_INK_DARK = "#111111";

/**
 * The ink that reads on a block filled with `hex`.
 *
 * A colour we cannot parse gets `"light"` — the same answer the fill itself
 * falls back to (`var(--ev-color, var(--accent))` lands on the accent, which
 * is dark), so an unreadable setting cannot produce an invisible title.
 */
export function readableInkOn(hex: string): BlockInk {
  return contrastRatio(hex, BLOCK_INK_LIGHT) >= contrastRatio(hex, BLOCK_INK_DARK) ? "light" : "dark";
}
