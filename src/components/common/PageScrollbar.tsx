// The scrollbar the app took away and never gave back.
//
// 01-base.css hides every native scrollbar so a scrolling column is exactly as
// wide as a still one — no reserved gutter, nothing shifting sideways when a
// list grows. That half is the reference's too (TICKTICK_COMPONENT_02 §4:
// `scrollbar-width: none`, native width measured at 0). The half we skipped is
// the one it draws in place of it.
//
// It matters more here than it would there, because in this app the PAGE is
// what scrolls. With forty tasks in a list, `<html>` is 1588px inside a 720px
// window and there is no bar, no position, and nothing saying there is more
// below. Measured in the running app before writing this.
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
// One divergence, and it is forced. "Until the pointer leaves" has no meaning
// for a scroller whose area is the whole window, so the page's thumb fades
// once scrolling stops instead. The observable rules that survive are the two
// that matter: hover alone never summons it, and it goes away on its own.
import { useEffect, useRef, useState } from "react";
import { thumbGeometry } from "../../domain/view/overlayScrollbar";

/** §4.1 measured the fade starting between 1.8 and 2.2 seconds. */
const HIDE_AFTER_MS = 2000;

export function PageScrollbar() {
  const thumb = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redraw = useRef<() => void>(() => {});
  const [needed, setNeeded] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scroller = document.scrollingElement ?? document.documentElement;

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

    const onScroll = () => {
      draw();
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    };

    // Not just scrolling: the content can grow or shrink under a still page —
    // a Task completed out of a filtered list, a section collapsed — and the
    // thumb would keep the length it had. Recomputing does not show it.
    redraw.current = draw;
    const observer = new ResizeObserver(draw);
    observer.observe(document.body);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", draw);
    draw();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", draw);
      observer.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // The first measurement happens before there is a thumb to write it to —
  // it is what decides whether one gets rendered at all — so the sizes it
  // computed had nowhere to go. Measured as a 6px bar of zero height on the
  // running app. This draws again once the element exists.
  useEffect(() => {
    if (needed) redraw.current();
  }, [needed]);

  // Drawn even while hidden once it is needed, so the first scroll fades a
  // thumb that is already the right size in the right place rather than
  // popping one into existence.
  if (!needed) return null;

  return (
    <div
      ref={thumb}
      className={`page-scrollbar${visible ? " is-visible" : ""}`}
      // Decoration: the position it reports is already in the scroll position,
      // and there is nothing here to operate.
      aria-hidden="true"
    />
  );
}
