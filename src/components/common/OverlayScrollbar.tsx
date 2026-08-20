// The scrollbar the app took away and never gave back.
//
// 01-base.css hides every native scrollbar so a scrolling column is exactly as
// wide as a still one — no reserved gutter, nothing shifting sideways when a
// list grows. That half is the reference's too (TICKTICK_COMPONENT_02 §4:
// `scrollbar-width: none`, native width measured at 0). The half we skipped is
// the one it draws in place of it.
//
// §4.1 timed the behaviour, and the surprising part is what does NOT show it:
//
//   pointer over the scrolling area .................. stays hidden
//   pointer directly over the bar itself ............. stays hidden
//   an actual scroll ................................. appears
//   pointer still inside, 3.5s later ................. still there
//   pointer leaves ................................... gone in 1.8–2.2s
//
// So it answers scrolling, not pointing — you can read a list from top to
// bottom without a bar ever appearing beside it.
//
// Two things scroll in this app and they need the same bar for different
// reasons, so this takes either.
//
//   no ref  — the PAGE, which is what scrolls nearly everywhere here. Forty
//             tasks make `<html>` 1588px inside a 720px window, measured.
//   a ref   — one element, for the places that scroll inside themselves. The
//             calendar's time grid is the only one so far.
//
// The page is where the reference's rule cannot be followed literally: "until
// the pointer leaves" has no meaning for a scroller whose area is the whole
// window, so the page's thumb fades once scrolling stops instead. An element
// has an outside, so an element gets the measured rule. Either way the two
// observable properties that matter survive — hover alone never summons it,
// and it leaves on its own.
import { useEffect, useRef, useState, type RefObject } from "react";
import { thumbGeometry } from "../../domain/view/overlayScrollbar";

/** §4.1 measured the fade starting between 1.8 and 2.2 seconds. */
const HIDE_AFTER_MS = 2000;

interface OverlayScrollbarProps {
  /**
   * The element that scrolls. Omit for the page.
   *
   * An element's thumb is positioned against the scroller's nearest
   * positioned ancestor, so that ancestor has to be one — and the scroller has
   * to fill it, or the bar will be beside the wrong box.
   */
  scrollerRef?: RefObject<HTMLElement | null>;
}

export function OverlayScrollbar({ scrollerRef }: OverlayScrollbarProps) {
  const thumb = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redraw = useRef<() => void>(() => {});
  const [needed, setNeeded] = useState(false);
  const [visible, setVisible] = useState(false);
  // Which bar this is comes from the PROP, not from whether the ref has landed
  // yet. A ref is empty on the first render, and deciding from that would make
  // an element's bar spend one render believing it was the page's.
  const isPage = !scrollerRef;
  const [element, setElement] = useState<HTMLElement | null>(null);

  // No dependency array on purpose: a ref changing does not re-render, so the
  // only reliable moment to read one is after each render. `setElement` with
  // an unchanged value is a no-op, so this settles immediately and then costs
  // nothing — and it survives the scroller being swapped when the calendar
  // changes view.
  useEffect(() => {
    setElement(scrollerRef?.current ?? null);
  });

  useEffect(() => {
    // Told to watch an element, and it is not on the page yet.
    if (!isPage && !element) return;
    const scroller = element ?? document.scrollingElement ?? document.documentElement;
    // Scroll events from the document reach `window`; an element's reach the
    // element.
    const source: EventTarget = element ?? window;

    // The thumb is written to directly rather than through state: this runs on
    // every scroll event, and a re-render per frame to move one element is the
    // kind of cost that makes scrolling feel worse than having no bar at all.
    const draw = () => {
      const geometry = thumbGeometry({
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      });
      setNeeded(geometry.needed);
      const node = thumb.current;
      if (!node || !geometry.needed) return;
      node.style.height = `${geometry.height}px`;
      node.style.transform = `translateY(${geometry.offset}px)`;
    };

    // Whether the pointer is over the scroller. Only an element can answer
    // this; for the page the answer is always "yes" and it would never hide.
    let pointerInside = false;

    const scheduleHide = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (element && pointerInside) return;
      hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    };

    const onScroll = () => {
      draw();
      setVisible(true);
      scheduleHide();
    };

    // Note what is NOT here: nothing shows the bar. Entering only cancels a
    // pending fade, so hovering a scroller that has not been scrolled leaves
    // it hidden, exactly as §4.1 measured.
    const onEnter = () => {
      pointerInside = true;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    const onLeave = () => {
      pointerInside = false;
      scheduleHide();
    };

    // Not just scrolling: the content can grow or shrink under a still page —
    // a Task completed out of a filtered list, a section collapsed — and the
    // thumb would keep the length it had. Recomputing does not show it.
    const observer = new ResizeObserver(draw);
    observer.observe(element ?? document.body);

    redraw.current = draw;
    source.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", draw);
    if (element) {
      element.addEventListener("pointerenter", onEnter);
      element.addEventListener("pointerleave", onLeave);
    }
    draw();

    return () => {
      source.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", draw);
      if (element) {
        element.removeEventListener("pointerenter", onEnter);
        element.removeEventListener("pointerleave", onLeave);
      }
      observer.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [element, isPage]);

  // The first measurement happens before there is a thumb to write it to — it
  // is what decides whether one gets rendered at all — so the sizes it
  // computed had nowhere to go. Measured as a 6px bar of zero height on the
  // running app. This draws again once the element exists.
  useEffect(() => {
    if (needed) redraw.current();
  }, [needed]);

  if (!needed) return null;

  return (
    <div
      ref={thumb}
      className={`overlay-scrollbar${isPage ? " is-page" : ""}${visible ? " is-visible" : ""}`}
      // Decoration: the position it reports is already in the scroll position,
      // and there is nothing here to operate.
      aria-hidden="true"
    />
  );
}
