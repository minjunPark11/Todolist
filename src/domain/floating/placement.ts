// Where a floating surface goes (spec §19.10–§19.16).
//
// One engine, because §19.10 asks for exactly that: "각 feature가 자체
// getBoundingClientRect() 계산을 반복하지 않는다". The app had the opposite —
// the context menu guessed its own height from an ESTIMATED_WIDTH constant and
// an assumed 32px per row, and kit's Popover did no collision handling at all,
// so a menu near the bottom of the window ran off it.
//
// Everything here is a pure function of rectangles. No DOM, no React, no
// measuring: the caller measures and passes the numbers in. That is what lets
// the hard cases — bottom edge, right edge, viewport smaller than the surface
// — be tested as arithmetic rather than as a browser.
//
// All rectangles are VIEWPORT coordinates (see `Rect`).
import type { Align, Placement, Rect, Side, Size } from "./types";

/** §19.12: a small visual gap between trigger and surface. */
export const DEFAULT_OFFSET = 6;

/** §19.15: how close to the viewport edge a surface may come. */
export const DEFAULT_COLLISION_PADDING = 8;

/**
 * §19.14's "anchor와의 관계를 완전히 잃을 정도로 멀리 이동시키지 않는다",
 * made a number.
 *
 * A surface shifted to stay on screen must still overlap its anchor by at
 * least this much, so it continues to read as belonging to the control that
 * opened it rather than as a panel that appeared somewhere nearby. Best
 * effort: staying visible wins if both cannot hold.
 */
const MIN_ANCHOR_OVERLAP = 16;

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** Whether the side sits before the anchor on its axis, rather than after it. */
const IS_BEFORE: Record<Side, boolean> = {
  top: true,
  left: true,
  bottom: false,
  right: false,
};

export function sideOf(placement: Placement): Side {
  return placement.slice(0, placement.indexOf("-")) as Side;
}

export function alignOf(placement: Placement): Align {
  return placement.slice(placement.indexOf("-") + 1) as Align;
}

export interface PlacementInput {
  /** The trigger, as measured (§19.8 — never a hardcoded viewport point). */
  anchor: Rect;
  /** The surface's natural size, measured before any constraint is applied. */
  floating: Size;
  viewport: Size;
  /** §19.11's per-feature preference. Flip may overrule it. */
  placement: Placement;
  offset?: number;
  collisionPadding?: number;
}

export interface PlacementResult {
  x: number;
  y: number;
  /** What was actually used — the preference, or its opposite after a flip. */
  placement: Placement;
  /**
   * §19.16. Always returned, not only when constrained: the surface applies
   * both as CSS every time, so a viewport that shrinks later cannot leave it
   * larger than the space it now has (§19.18).
   */
  maxWidth: number;
  maxHeight: number;
  didFlip: boolean;
  didShift: boolean;
}

/** Room between the anchor and the viewport edge on one side, after padding. */
function spaceOn(side: Side, anchor: Rect, viewport: Size, offset: number, padding: number): number {
  const before = IS_BEFORE[side];
  const vertical = side === "top" || side === "bottom";
  const anchorStart = vertical ? anchor.y : anchor.x;
  const anchorSize = vertical ? anchor.height : anchor.width;
  const viewportSize = vertical ? viewport.height : viewport.width;
  const raw = before ? anchorStart : viewportSize - (anchorStart + anchorSize);
  return Math.max(0, raw - offset - padding);
}

/**
 * Position a surface against its anchor, flipping and shifting to keep all of
 * it on screen.
 *
 * The order is flip, then constrain, then align, then shift — and it has to be
 * that order. Flipping decides which side, which decides the size cap, which
 * decides the size, which is what the cross-axis alignment and the shift are
 * computed against. Aligning first and flipping afterwards would align against
 * a size the surface no longer has.
 */
export function computePlacement({
  anchor,
  floating,
  viewport,
  placement,
  offset = DEFAULT_OFFSET,
  collisionPadding: padding = DEFAULT_COLLISION_PADDING,
}: PlacementInput): PlacementResult {
  const preferred = sideOf(placement);
  const align = alignOf(placement);

  // §19.13. Flip only when the other side is genuinely better: when neither
  // side fits, flipping to the smaller one would hide MORE of the surface
  // while also moving it, which is the worst of both.
  const preferredSpace = spaceOn(preferred, anchor, viewport, offset, padding);
  const oppositeSpace = spaceOn(OPPOSITE[preferred], anchor, viewport, offset, padding);
  const vertical = preferred === "top" || preferred === "bottom";
  const wanted = vertical ? floating.height : floating.width;
  const didFlip = preferredSpace < wanted && oppositeSpace > preferredSpace;
  const side = didFlip ? OPPOSITE[preferred] : preferred;
  const mainSpace = didFlip ? oppositeSpace : preferredSpace;

  // §19.16 / §19.17: the cap on the main axis is the room on the chosen side,
  // so a surface longer than that scrolls INSIDE itself rather than growing
  // past the viewport edge.
  const crossLimit = (vertical ? viewport.width : viewport.height) - padding * 2;
  const maxMain = Math.max(0, mainSpace);
  const maxCross = Math.max(0, crossLimit);
  const mainSize = Math.min(vertical ? floating.height : floating.width, maxMain);
  const crossSize = Math.min(vertical ? floating.width : floating.height, maxCross);

  const anchorMainStart = vertical ? anchor.y : anchor.x;
  const anchorMainSize = vertical ? anchor.height : anchor.width;
  const main = IS_BEFORE[side]
    ? anchorMainStart - offset - mainSize
    : anchorMainStart + anchorMainSize + offset;

  const anchorCrossStart = vertical ? anchor.x : anchor.y;
  const anchorCrossSize = vertical ? anchor.width : anchor.height;
  const crossViewport = vertical ? viewport.width : viewport.height;

  let cross: number;
  if (align === "start") cross = anchorCrossStart;
  else if (align === "end") cross = anchorCrossStart + anchorCrossSize - crossSize;
  else cross = anchorCrossStart + anchorCrossSize / 2 - crossSize / 2;
  const aligned = cross;

  // §19.14. Clamp into the viewport first — being visible is the constraint
  // that cannot be traded away.
  const lowest = padding;
  const highest = Math.max(padding, crossViewport - crossSize - padding);
  cross = Math.min(Math.max(cross, lowest), highest);

  // Then keep it touching its anchor, if the clamp left room to. Both bounds
  // are computed and intersected rather than applied in sequence, because on a
  // narrow viewport the overlap window can fall entirely outside the visible
  // window, and in that case the visible window is the one that holds.
  const overlap = Math.min(MIN_ANCHOR_OVERLAP, anchorCrossSize, crossSize);
  const nearest = anchorCrossStart - crossSize + overlap;
  const furthest = anchorCrossStart + anchorCrossSize - overlap;
  if (nearest <= highest && furthest >= lowest) {
    cross = Math.min(Math.max(cross, Math.max(nearest, lowest)), Math.min(furthest, highest));
  }

  return {
    x: vertical ? cross : main,
    y: vertical ? main : cross,
    placement: `${side}-${align}` as Placement,
    maxWidth: vertical ? maxCross : maxMain,
    maxHeight: vertical ? maxMain : maxCross,
    didFlip,
    didShift: cross !== aligned,
  };
}

/**
 * Whether the anchor has left the viewport entirely (§19.19, §19.20).
 *
 * Returned rather than acted on: §19.19 offers closing as a policy the caller
 * "can" adopt, and a Tooltip and a draft Reminder form should not answer that
 * question the same way. Fully outside, not partly — a trigger half-scrolled
 * under a sticky header is still the thing the surface belongs to.
 */
export function isAnchorHidden(anchor: Rect, viewport: Size): boolean {
  // An anchor with no size at all has not been laid out — the first frame
  // after mount, an element inside a collapsed container, a test environment
  // that does no layout. Geometry cannot tell that apart from "scrolled just
  // past the top edge", and the two want opposite answers, so the unmeasured
  // case is decided here instead of guessed at: not knowing where a trigger is
  // is not evidence that it has gone.
  if (anchor.width === 0 && anchor.height === 0) return false;
  return (
    anchor.y + anchor.height <= 0 ||
    anchor.y >= viewport.height ||
    anchor.x + anchor.width <= 0 ||
    anchor.x >= viewport.width
  );
}
