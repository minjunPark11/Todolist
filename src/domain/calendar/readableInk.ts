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

// ---------------------------------------------------------------------------
// Making a colour safe for one ink (CALENDAR_FILL_READABILITY_DESIGN.md §3)
//
// Choosing the ink per colour cleared 4.5:1 everywhere, and a grey block with
// black text still read as disabled — the ratio passes and the eye disagrees.
// So the ink is white on every filled block now, and the colour is what moves.
//
// A function rather than a new list of eight hexes, because `List.color` also
// takes any `#RRGGBB` from a colour input: a palette cannot cover a value the
// user typed, and this covers both with one rule.
// ---------------------------------------------------------------------------

/**
 * 5, not 4.5.
 *
 * Block text is 11px and 10px. Sitting exactly on the bar leaves nothing for
 * antialiasing to spend, and 5.5 pushes all eight hues into one dark band
 * where they stop telling each other apart (§3.1).
 */
export const WHITE_INK_TARGET = 5;

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function channelFromHue(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function fromHsl(hue: number, saturation: number, lightness: number): string {
  let r: number;
  let g: number;
  let b: number;
  if (saturation === 0) {
    r = lightness;
    g = lightness;
    b = lightness;
  } else {
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    r = channelFromHue(p, q, hue + 1 / 3);
    g = channelFromHue(p, q, hue);
    b = channelFromHue(p, q, hue - 1 / 3);
  }
  return `#${[r, g, b].map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
}

// The palette is eight entries plus a grey, and this runs once per item while
// a month is rebuilt. Keyed by both arguments so a caller passing a different
// target cannot read another one's answer.
const darkened = new Map<string, string>();

/**
 * The same colour, dark enough for white text.
 *
 * Only the LIGHTNESS moves: hue and saturation are kept, so a yellow List
 * stays the yellow one even after it has become amber. That is the trade §3
 * accepts and cannot avoid — a yellow that white text reads on is not yellow,
 * because yellow is bright by definition.
 *
 * A colour already past the target comes back untouched (indigo, purple), so
 * running this twice changes nothing. A colour this build cannot parse comes
 * back as it arrived: `readableInkOn` is still there to pick an ink for it,
 * which is why a failure here cannot erase a title.
 */
export function darkenForWhiteInk(hex: string, target = WHITE_INK_TARGET): string {
  const cacheKey = `${hex}|${target}`;
  const cached = darkened.get(cacheKey);
  if (cached !== undefined) return cached;

  const remember = (value: string) => {
    darkened.set(cacheKey, value);
    return value;
  };

  const rgb = parseHex(hex);
  if (!rgb) return remember(hex);
  if (contrastRatio(hex, BLOCK_INK_LIGHT) >= target) return remember(hex);

  const [hue, saturation, lightness] = toHsl(rgb);
  // Monotonic — every step down raises the contrast against white — so the
  // first value that clears the bar is the lightest one that does, which keeps
  // the colour as close to what its owner picked as the rule allows.
  for (let next = lightness; next > 0.02; next -= 0.004) {
    const candidate = fromHsl(hue, saturation, next);
    if (contrastRatio(candidate, BLOCK_INK_LIGHT) >= target) return remember(candidate);
  }
  // Unreachable for any real colour: black is 21:1 against white. Here so the
  // function has a value on every path rather than a bare fallthrough.
  return remember(fromHsl(hue, saturation, 0.02));
}
