// The two custom properties every event surface hands to CSS.
//
// `--ev-color` was set inline in five places and the stylesheet mixed
// everything from it. D3-D adds a second value that cannot be mixed in CSS —
// which ink reads on the filled block (see `readableInk.ts`) — and five copies
// of "colour, and also its ink" is how the two come to disagree. One helper,
// so a surface that has a colour cannot forget the ink that goes with it.
import type { CSSProperties } from "react";
import { BLOCK_INK_DARK, BLOCK_INK_LIGHT, readableInkOn } from "../../domain/calendar/readableInk";

export function eventColorVars(color: string): CSSProperties {
  return {
    ["--ev-color"]: color,
    ["--ev-ink-auto"]: readableInkOn(color) === "light" ? BLOCK_INK_LIGHT : BLOCK_INK_DARK,
  } as CSSProperties;
}
