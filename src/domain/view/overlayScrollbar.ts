// Where the overlay scrollbar's thumb sits, given how far something is scrolled.
//
// The app hides every native scrollbar (01-base.css: `scrollbar-width: none`
// plus a zero-width `::-webkit-scrollbar`) so that a scrolling column is
// exactly as wide as a still one. What it never did was put anything back, and
// the page itself is what scrolls here — a long list makes `<html>` taller than
// the window with no bar, no position and no sign that there is more below.
//
// TICKTICK_COMPONENT_02 §4 measured the reference doing the same hiding and
// then drawing its own: one absolutely positioned element, 6px wide, radius 7,
// the foreground colour at 30%, `right: 2px`, no track and no arrows — a thumb
// and nothing else.
//
// The height is the ordinary proportional one, and that is measured rather
// than assumed: §4 recorded a thumb of 670 where the scroll range was 3px, and
// 184.3 where it was 324. `clientHeight² / scrollHeight` reproduces both to
// the decimal (implying scrollers of 673 and 353.3, which are the two viewport
// sizes that session used). No other formula fits both.
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ThumbGeometry {
  /** False when the content fits — the caller should draw nothing at all. */
  needed: boolean;
  height: number;
  /** Distance from the top of the scroller to the top of the thumb. */
  offset: number;
}

/**
 * The 2px the thumb is inset from the TOP, and only the top.
 *
 * §4 measured `top: 0` with `margin-top: 2px` and said nothing about the
 * bottom, so a symmetric inset was tried first — and the measurement rejected
 * it. The same section recorded a 670px thumb in a 673px scroller, which only
 * fits if the track is `clientHeight - 2`; reserving 2px at both ends caps it
 * at 669. The reference lets the thumb reach the lower edge.
 */
export const THUMB_INSET = 2;

/**
 * The shortest a thumb may get.
 *
 * Not measured — the reference's two samples were both long. Purely
 * proportional height means a document twenty times the window gives a 36px
 * thumb and one a hundred times gives 7px, which stops being something a
 * person can see. This is the floor that keeps it visible; it costs accuracy
 * only where the thumb was already too small to read a position from.
 */
export const MIN_THUMB_HEIGHT = 24;

/** Clamp, without pulling in a dependency for it. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function thumbGeometry(metrics: ScrollMetrics): ThumbGeometry {
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  const range = scrollHeight - clientHeight;

  // A sub-pixel range is not something anyone can scroll, and dividing by it
  // below would put the thumb anywhere.
  if (!(range > 1) || !(clientHeight > 0)) return { needed: false, height: 0, offset: 0 };

  // Inset at the top, flush at the bottom — see THUMB_INSET.
  const track = clientHeight - THUMB_INSET;
  const proportional = (clientHeight * clientHeight) / scrollHeight;
  // The floor may not push the thumb past the track it travels in, which is
  // what would happen in a very short scroller.
  const height = clamp(proportional, Math.min(MIN_THUMB_HEIGHT, track), track);
  const progress = clamp(scrollTop / range, 0, 1);

  return { needed: true, height, offset: THUMB_INSET + (track - height) * progress };
}
