// The viewport's current mode, as React state (TickTick plan §15.3).
//
// The signal is a `ResizeObserver` on the document element, with `resize` and
// `orientationchange` beside it. That is one more mechanism than looks
// necessary, and each earned its place: media queries and `resize` both go
// silent under an emulated or embedded viewport, where the observer still
// fires, and a layout that is only correct after a reload is not a responsive
// layout. The mode is recomputed and compared, so React bails out on every
// event except the three or four that actually cross a breakpoint.
//
import { useEffect, useState } from "react";
import { responsiveModeFor, type ResponsiveMode } from "../../domain/tasks/responsive";

function currentMode(): ResponsiveMode {
  // SSR and tests have no window; the widest mode is the one whose layout
  // degrades most gracefully if it turns out to be wrong for one frame.
  return responsiveModeFor(typeof window === "undefined" ? 1440 : window.innerWidth);
}

export function useResponsiveMode(): ResponsiveMode {
  const [mode, setMode] = useState<ResponsiveMode>(currentMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setMode(currentMode());
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(document.documentElement);
    window.addEventListener("resize", update);
    // Rotating a device changes the mode (§15.10) — and is not navigation.
    window.addEventListener("orientationchange", update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return mode;
}

/**
 * Keeps `--tm-viewport-height` equal to what is actually visible (§15.37).
 *
 * `100vh` does not shrink when the on-screen keyboard opens, so a full-screen
 * Task Detail sized by it puts its own bottom — the save row, the subtask
 * field — underneath the keyboard the user is typing on. `visualViewport`
 * reports the part that is really visible, which is the height to use.
 *
 * Falls back to `100dvh` in the stylesheet when the API is absent, so nothing
 * depends on this having run.
 */
export function useViewportHeightVar(): void {
  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport) return;
    const update = () => {
      document.documentElement.style.setProperty("--tm-viewport-height", `${viewport.height}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    // The keyboard can also scroll the visual viewport without resizing it.
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--tm-viewport-height");
    };
  }, []);
}
