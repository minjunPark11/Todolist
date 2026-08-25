// The Task Detail pane's width, and the drag that changes it (spec §1.12–§1.14).
//
// Deliberately the same shape as `useContextSidebar`: two resize handles that
// behaved differently would be two things to learn. The rules are all in
// `app/taskDetailWidth.ts`; what is here is the part that needs a pointer.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampTaskDetailWidth,
  detailWidthAfterDrag,
  detailWidthAfterKey,
  readStoredDetailWidth,
  TASK_DETAIL_DEFAULT_WIDTH,
  TASK_DETAIL_WIDTH_KEY,
} from "../app/taskDetailWidth";

export interface TaskDetailWidthState {
  width: number;
  isResizing: boolean;
  /** pointerdown on the handle. */
  beginResize: (clientX: number) => void;
  /** One key on the handle. Returns whether it was handled. */
  resizeByKey: (key: string, shift: boolean) => boolean;
  /** Double-click resets to the default, not to the last width. */
  resetWidth: () => void;
}

function persist(value: number): void {
  try {
    localStorage.setItem(TASK_DETAIL_WIDTH_KEY, String(value));
  } catch {
    // A session without storage still resizes; it just forgets (§1.14 says
    // restore "가능한 경우", so forgetting is a permitted outcome, not a bug).
  }
}

export function useTaskDetailWidth(): TaskDetailWidthState {
  const [width, setWidth] = useState(() => {
    try {
      return readStoredDetailWidth(localStorage.getItem(TASK_DETAIL_WIDTH_KEY));
    } catch {
      return TASK_DETAIL_DEFAULT_WIDTH;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  // The drag's bookkeeping. Refs, not state: these change on every pointermove
  // and none of them belong in a render.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  const beginResize = useCallback((clientX: number) => {
    dragRef.current = { startX: clientX, startWidth: widthRef.current };
    setIsResizing(true);
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(TASK_DETAIL_DEFAULT_WIDTH);
    persist(TASK_DETAIL_DEFAULT_WIDTH);
  }, []);

  const resizeByKey = useCallback((key: string, shift: boolean) => {
    const next = detailWidthAfterKey(widthRef.current, key, shift);
    if (next === null) return false;
    setWidth(next);
    persist(next);
    return true;
  }, []);

  // On the window, not the handle: a fast pointer leaves an 8px target behind
  // long before the drag is over.
  useEffect(() => {
    if (!isResizing) return;

    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      setWidth(detailWidthAfterDrag(drag.startWidth, event.clientX - drag.startX));
    }
    function finish() {
      dragRef.current = null;
      setIsResizing(false);
      // §1.12 saves on pointerUp. One write per drag rather than one per move,
      // which would put a hundred entries through localStorage for one gesture.
      persist(clampTaskDetailWidth(widthRef.current));
    }
    function handleKeyDown(event: KeyboardEvent) {
      // Escape abandons the drag and restores the width it started at, which
      // is the same thing Escape does to a draft everywhere else in the app.
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

  // Text under the pointer must not select while a divider is being dragged,
  // and the cursor must not flicker back to a caret over the content.
  useEffect(() => {
    if (!isResizing) return;
    const root = document.documentElement;
    const previousSelect = root.style.userSelect;
    const previousCursor = root.style.cursor;
    root.style.userSelect = "none";
    root.style.cursor = "col-resize";
    return () => {
      root.style.userSelect = previousSelect;
      root.style.cursor = previousCursor;
    };
  }, [isResizing]);

  return useMemo(
    () => ({ width, isResizing, beginResize, resizeByKey, resetWidth }),
    [width, isResizing, beginResize, resizeByKey, resetWidth],
  );
}
