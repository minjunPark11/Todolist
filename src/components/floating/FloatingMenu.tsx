// A menu on the shared layer system (spec §19.39, §19.42, §19.90).
//
// The difference from `Popover` is where it hangs and who opens it. A Popover
// belongs to a trigger and toggles; a menu opened by right-click has no
// trigger at all and hangs from the pointer (§19.9's third anchor kind, §19.42).
// So this one is controlled by being MOUNTED rather than by an `open` prop —
// which is also the API the app's context menu already had.
//
// It brings the menu semantics §19.39 asks for: `role="menu"`, arrow-key
// movement across the items, and focus that goes back where it came from
// (§19.32). What it does NOT bring is the dismissal rules, because those are
// the manager's now — which is the whole point of moving it here.
import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DismissReason, Placement, Rect } from "../../domain/floating";
import { useMotionEnabled } from "../../motion/reducedMotion";
import { useFloatingLayers } from "./FloatingLayerProvider";
import { moveMenuFocus } from "./menuNavigation";
import { rectOfPoint, useFloatingPosition } from "./useFloatingPosition";

export interface FloatingMenuProps {
  children: ReactNode;
  /** Announced as the menu's name (§19.88). */
  label: string;
  /** Viewport coordinates of the pointer, or of the button that opened it. */
  anchor: { x: number; y: number } | Rect;
  /** §19.94's reason, so a caller can tell a choice from a dismissal. */
  onDismiss: (reason: DismissReason) => void;
  /** §19.74, when the menu belongs to one Task's Detail. */
  ownerTaskId?: string;
  placement?: Placement;
  className?: string;
}

/**
 * §19.12's gap, smaller here than for a popover.
 *
 * A context menu should feel attached to the pointer rather than offered
 * near it, and the pointer is already sitting on the corner the menu grows
 * from.
 */
const POINTER_OFFSET = 2;

function toRect(anchor: { x: number; y: number } | Rect): Rect {
  return "width" in anchor ? anchor : rectOfPoint(anchor.x, anchor.y);
}

export function FloatingMenu({
  children,
  label,
  anchor,
  onDismiss,
  ownerTaskId,
  placement = "bottom-start",
  className,
}: FloatingMenuProps) {
  const layers = useFloatingLayers();
  const motionEnabled = useMotionEnabled();
  const id = useId();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const dismissCallback = useRef(onDismiss);
  dismissCallback.current = onDismiss;

  // The anchor is a plain object from props, so a new one arrives on every
  // render. It is held in a ref so an unchanged anchor does not restart the
  // measuring effect — but the getter's identity is keyed to the COORDINATES,
  // so a changed one does.
  //
  // That second half is §19.44's reopen. Right-clicking a second row while the
  // menu is open keeps the same component mounted and only changes these
  // numbers; with a permanently stable getter the effect never re-ran and the
  // menu stayed sitting over the first row. Reproduced in the browser.
  const rect = toRect(anchor);
  const anchorRef = useRef(rect);
  anchorRef.current = rect;
  const anchorRect = useCallback(() => anchorRef.current, [rect.x, rect.y, rect.width, rect.height]);
  const surface = useCallback(() => surfaceRef.current, []);

  const position = useFloatingPosition({
    open: true,
    anchorRect,
    surface,
    placement,
    offset: POINTER_OFFSET,
  });

  // Registered for as long as it is mounted. There is no `open` here: the
  // caller decides by rendering it, which is what makes `menu ? <Menu/> : null`
  // the whole of the caller's state.
  useEffect(() => {
    layers.openLayer(
      { id, type: "context-menu", ownerTaskId },
      {
        surface: () => surfaceRef.current,
        // No trigger: a right-click menu has none, and the element under the
        // pointer is not one — treating it as the trigger would make every
        // click on that row count as "inside" and stop dismissing the menu.
        trigger: () => null,
        dismiss: (reason) => dismissCallback.current(reason),
      },
    );
    return () => layers.releaseLayer(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ownerTaskId]);

  /**
   * §19.32: focus is captured on mount and put back on unmount.
   *
   * Unconditional here, unlike the Popover's, because a menu ALWAYS takes
   * focus when it opens — §19.39's arrow keys have to land somewhere — so
   * there is no case where focus was left outside and putting it back would
   * be stealing it.
   */
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => {
      const back = opener.current;
      if (back?.isConnected) back.focus();
    };
  }, []);

  // Waits for the measurement, for the reason `PopoverContent` documents: the
  // surface is hidden until it has a position, and focusing a hidden element
  // is a silent no-op.
  useEffect(() => {
    if (!position) return;
    surfaceRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, [position]);

  if (!layers.portalRoot) return null;

  return createPortal(
    <div
      ref={surfaceRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={`ff-layer ff-menu${className ? ` ${className}` : ""}${motionEnabled ? " is-animated" : ""}`}
      data-placement={position?.placement ?? placement}
      onKeyDown={(event) => moveMenuFocus(surfaceRef.current, event)}
      style={{
        position: "fixed",
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        maxWidth: position?.maxWidth,
        maxHeight: position?.maxHeight,
        zIndex: layers.zIndex(id),
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    layers.portalRoot,
  );
}
