// Measuring, and re-measuring (spec §19.18, §19.19, §19.20).
//
// The arithmetic is `computePlacement`'s and is tested without a browser. What
// is here is the part that has to touch one: reading the two rectangles, and
// knowing when they have changed.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  computePlacement,
  isAnchorHidden,
  type Placement,
  type PlacementResult,
  type Rect,
} from "../../domain/floating";

export interface FloatingPositionOptions {
  open: boolean;
  /**
   * Where the anchor is, as a rectangle — never as an element (§19.9).
   *
   * §19.9 lists four kinds of anchor: a DOM element, a caret rect, pointer
   * coordinates, a selection range. Only the first is an element, and a hook
   * that took an element could serve only that one. A context menu opens at
   * the pointer and has no trigger at all.
   */
  anchorRect: () => Rect | null;
  /**
   * The element behind that rect, when there is one.
   *
   * Used for nothing but the ResizeObserver: a trigger that changes size moves
   * the surface, and a virtual anchor has no size of its own to change.
   */
  anchorElement?: () => HTMLElement | null;
  surface: () => HTMLElement | null;
  placement: Placement;
  offset?: number;
  collisionPadding?: number;
  /** §19.19's optional policy, left to the caller as the spec leaves it. */
  onAnchorHidden?: () => void;
}

/** The rect of an element, or null when it is not there — §19.9's first kind. */
export function rectOfElement(element: HTMLElement | null): Rect | null {
  if (!element) return null;
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

/**
 * A rect for a point (§19.9's pointer coordinates).
 *
 * Zero-sized, which is what makes a context menu land ON the pointer rather
 * than beside it: `computePlacement` offsets from the anchor's edge, and an
 * anchor with no extent has one edge.
 */
export function rectOfPoint(x: number, y: number): Rect {
  return { x, y, width: 0, height: 0 };
}

/**
 * Where the surface should sit, recomputed whenever that could have changed.
 *
 * Returns null until the first measurement, and the surface is rendered
 * hidden until then: laying it out at 0,0 for one frame and moving it
 * afterwards is a visible jump, and on a slow frame it is a popover that
 * appears in the corner of the window.
 */
export function useFloatingPosition({
  open,
  anchorRect,
  anchorElement,
  surface,
  placement,
  offset,
  collisionPadding,
  onAnchorHidden,
}: FloatingPositionOptions): PlacementResult | null {
  const [position, setPosition] = useState<PlacementResult | null>(null);

  // Held in a ref so the measuring effect does not restart — and therefore
  // does not re-add its listeners — every time the caller passes a fresh
  // closure, which is every render.
  const hiddenCallback = useRef(onAnchorHidden);
  hiddenCallback.current = onAnchorHidden;

  const measure = useCallback(() => {
    const rect = anchorRect();
    const surfaceEl = surface();
    if (!rect || !surfaceEl) return;
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    // `scrollWidth`/`scrollHeight` alongside the laid-out size, because by the
    // second measurement the surface is already wearing the caps this hook
    // gave it. Reading only `offsetHeight` would feed the constrained height
    // back in as if it were the natural one, and a surface that had been
    // capped once could never ask for the room to flip.
    const natural = {
      width: Math.max(surfaceEl.offsetWidth, surfaceEl.scrollWidth),
      height: Math.max(surfaceEl.offsetHeight, surfaceEl.scrollHeight),
    };

    setPosition(computePlacement({ anchor: rect, floating: natural, viewport, placement, offset, collisionPadding }));
    if (isAnchorHidden(rect, viewport)) hiddenCallback.current?.();
  }, [anchorRect, surface, placement, offset, collisionPadding]);

  // Layout effect: the first measurement happens before the browser paints, so
  // the surface is never seen in the wrong place.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    // §19.18 covers the window resizing; the ResizeObserver covers the two
    // cases it does not — the Detail panel being dragged narrower (§1.12),
    // which moves the anchor without a window resize, and the surface's own
    // content growing, as a Tag picker's list does while it is filtered.
    window.addEventListener("resize", schedule);
    // §19.19. Capture, and on the document rather than the window: the scroll
    // that moves a property row is the Detail panel's own, and a scroll event
    // from an inner container does not bubble.
    document.addEventListener("scroll", schedule, { capture: true, passive: true });

    const observer = new ResizeObserver(schedule);
    const anchorEl = anchorElement?.() ?? null;
    const surfaceEl = surface();
    if (anchorEl) observer.observe(anchorEl);
    if (surfaceEl) observer.observe(surfaceEl);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
      observer.disconnect();
    };
  }, [open, measure, anchorElement, surface]);

  return position;
}
