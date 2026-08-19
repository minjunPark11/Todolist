// The Context Sidebar's runtime state (Nav Shell spec §3.16–§3.30, §3.66–3.68).
//
// Owned by the App Shell, per §3.66: the width and the collapsed flag are shell
// state, not something either inner shell keeps for itself. That is the whole
// point of P0-3 — before this, the legacy shell had a collapse flag the Tasks
// Module knew nothing about, and neither had a width at all.
//
// `mode` is deliberately NOT state. §3.29 derives it from the route, so there
// is no way for it to disagree with the address.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COLLAPSED_STORAGE_KEY,
  CONTEXT_SIDEBAR_DEFAULT_WIDTH,
  WIDTH_STORAGE_KEY,
  clampContextSidebarWidth,
  contextSidebarModeFor,
  effectiveContextSidebarWidth,
  readStoredWidth,
  widthAfterKey,
  type ContextSidebarMode,
  type ContextSidebarVisibility,
} from "../app/contextSidebar";

export interface ContextSidebarState {
  mode: ContextSidebarMode;
  /** The remembered width, which survives a collapse (§3.28). */
  width: number;
  visibility: ContextSidebarVisibility;
  isResizing: boolean;
  /** What the layout uses: 0 when there is no sidebar or it is collapsed. */
  effectiveWidth: number;
  toggleCollapsed: () => void;
  /** pointerdown on the resize handle. */
  beginResize: (clientX: number) => void;
  /** One of §3.20's keys, applied to the handle. Returns true if it handled it. */
  resizeByKey: (key: string, shift: boolean) => boolean;
  /** §3.19: double-click resets to the default rather than to the last width. */
  resetWidth: () => void;
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A session without storage still resizes and collapses; it just forgets.
  }
}

export function useContextSidebar(path: string): ContextSidebarState {
  const mode = contextSidebarModeFor(path);
  const [width, setWidth] = useState(() => {
    try {
      return readStoredWidth(localStorage.getItem(WIDTH_STORAGE_KEY));
    } catch {
      return CONTEXT_SIDEBAR_DEFAULT_WIDTH;
    }
  });
  const [visibility, setVisibility] = useState<ContextSidebarVisibility>(() =>
    readStoredCollapsed() ? "collapsed" : "expanded",
  );
  const [isResizing, setIsResizing] = useState(false);

  // The drag's own bookkeeping. A ref rather than state: these change on every
  // pointermove and none of them belong in a render.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  const toggleCollapsed = useCallback(() => {
    setVisibility((current) => {
      const next = current === "collapsed" ? "expanded" : "collapsed";
      // §3.68: collapse persists immediately. It is one write per click, not
      // one per pointer move, so there is nothing to debounce.
      persist(COLLAPSED_STORAGE_KEY, next === "collapsed" ? "1" : "0");
      return next;
    });
  }, []);

  const beginResize = useCallback((clientX: number) => {
    dragRef.current = { startX: clientX, startWidth: widthRef.current };
    setIsResizing(true);
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(CONTEXT_SIDEBAR_DEFAULT_WIDTH);
    persist(WIDTH_STORAGE_KEY, String(CONTEXT_SIDEBAR_DEFAULT_WIDTH));
  }, []);

  const resizeByKey = useCallback((key: string, shift: boolean) => {
    const next = widthAfterKey(widthRef.current, key, shift);
    if (next === null) return false;
    setWidth(next);
    // §3.68 asks for a 150–300ms debounce here. One write per keypress is
    // already rare enough that debouncing would only add a way to lose the
    // last one, so this writes straight through.
    persist(WIDTH_STORAGE_KEY, String(next));
    return true;
  }, []);

  // The drag lives on the window, not on the handle: a fast pointer leaves a
  // 4px target behind long before the drag is over (§3.16).
  useEffect(() => {
    if (!isResizing) return;

    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      // Delta-based, so this never needs to know where the Rail ends.
      setWidth(clampContextSidebarWidth(drag.startWidth + (event.clientX - drag.startX)));
    }
    function finish() {
      dragRef.current = null;
      setIsResizing(false);
      // §3.68: one write, at the end. Writing per pointermove would put a
      // hundred entries through localStorage for one drag.
      persist(WIDTH_STORAGE_KEY, String(widthRef.current));
    }
    function handleKeyDown(event: KeyboardEvent) {
      // §3.63: Escape abandons the drag and restores the width it started at.
      if (event.key !== "Escape") return;
      const drag = dragRef.current;
      if (drag) setWidth(drag.startWidth);
      dragRef.current = null;
      setIsResizing(false);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isResizing]);

  // §3.62: text under the pointer must not select while dragging a divider.
  useEffect(() => {
    if (!isResizing) return;
    const root = document.documentElement;
    const previous = root.style.userSelect;
    root.style.userSelect = "none";
    root.style.cursor = "col-resize";
    return () => {
      root.style.userSelect = previous;
      root.style.cursor = "";
    };
  }, [isResizing]);

  return useMemo(
    () => ({
      mode,
      width,
      visibility,
      isResizing,
      effectiveWidth: effectiveContextSidebarWidth({ mode, width, visibility }),
      toggleCollapsed,
      beginResize,
      resizeByKey,
      resetWidth,
    }),
    [mode, width, visibility, isResizing, toggleCollapsed, beginResize, resizeByKey, resetWidth],
  );
}
