// What a tag chip is painted with (TASK_TAG_CHIPS_DESIGN.md §5, §6).
//
// Two decisions live here and neither of them is new:
//
// - The stored value is a List colour — a preset key or a `#RRGGBB`
//   (§5.1). Lists and tags share one palette, so "what does this colour mean"
//   is learned once rather than twice on one screen.
// - The contrast rule is the calendar's (§6). `CALENDAR_FILL_READABILITY_DESIGN.md`
//   already measured which fills white text reads on and which ones dark text
//   reads on, and left two functions behind. This file calls them; it does not
//   re-derive a bar.
//
// Both themes are answered at once and handed over as four values, because the
// alternative is a component that reads the theme — and then re-renders when it
// changes, for a colour that could have been computed once.
import type { Tag } from "../../types";
import { listColorHex } from "../tasks/listColor";
import { darkenForWhiteInk, tintForDarkInk, BLOCK_INK_DARK, BLOCK_INK_LIGHT } from "../calendar/readableInk";

/** A tag nobody has given a colour. Quiet, and the same in both themes. */
export const NEUTRAL_TAG_FILL_LIGHT = "#ececed";
export const NEUTRAL_TAG_FILL_DARK = "#3a3a3c";

export interface TagChipColors {
  fillLight: string;
  inkLight: string;
  fillDark: string;
  inkDark: string;
}

const NEUTRAL: TagChipColors = {
  fillLight: NEUTRAL_TAG_FILL_LIGHT,
  inkLight: "#3c3c43",
  fillDark: NEUTRAL_TAG_FILL_DARK,
  inkDark: "#e5e5e7",
};

const cache = new Map<string, TagChipColors>();

/**
 * The four values a chip needs, from what the tag has stored.
 *
 * A tag with no colour — which is every tag until someone opens the editor —
 * comes back neutral rather than guessed at. An auto-assigned hue was the
 * first draft of this file and it was dropped when the editor was decided
 * (§1.3): a colour nobody chose is a colour nobody can correct.
 *
 * A stored value this build cannot read comes back neutral too. It is NOT
 * erased — `parseListColor` keeps unknown values so a preset added in a later
 * release survives a round trip through this client.
 */
export function tagChipColors(tag: Pick<Tag, "color">): TagChipColors {
  const hex = listColorHex(tag.color ?? "");
  if (!hex) return NEUTRAL;

  const cached = cache.get(hex);
  if (cached) return cached;

  const colors: TagChipColors = {
    // Light: a pale tint under dark ink. A row can carry three chips and the
    // page still reads as a list rather than as a set of badges.
    fillLight: tintForDarkInk(hex),
    inkLight: BLOCK_INK_DARK,
    // Dark: the tint is lightness 0.9, which on a dark page is a torch. The
    // calendar's fill rule is the one that belongs here.
    fillDark: darkenForWhiteInk(hex),
    inkDark: BLOCK_INK_LIGHT,
  };
  cache.set(hex, colors);
  return colors;
}
