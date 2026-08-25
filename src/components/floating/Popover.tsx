// §19.72's primitives: Popover, PopoverTrigger, PopoverContent.
//
// A feature composes these and supplies the contents. It does not decide where
// the surface goes, what closes it, or what it stacks above — §19.71 gives all
// three to the layer system, which is what makes a Priority picker and a Tag
// picker behave the same way without either of them containing the rules.
//
// Nesting is automatic: a Popover rendered inside another one's content reads
// its parent's id from context and registers as its child, so §19.24's
// Schedule-owns-Reminder relationship exists without either feature declaring
// it. Getting that wrong is what §19.26 warns about, and it is exactly the
// kind of thing a feature would forget to say.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { DismissReason, LayerType, Placement } from "../../domain/floating";
import { useMotionEnabled } from "../../motion/reducedMotion";
import { useFloatingLayers } from "./FloatingLayerProvider";
import { useFloatingPosition } from "./useFloatingPosition";

interface PopoverContextValue {
  id: string;
  open: boolean;
  /** Opening is always the trigger's; closing can come from anywhere. */
  toggle: (fromKeyboard: boolean) => void;
  close: (reason: DismissReason) => void;
  placement: Placement;
  offset?: number;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
  surfaceRef: React.MutableRefObject<HTMLDivElement | null>;
  openedByKeyboard: React.MutableRefObject<boolean>;
  restoreFocusTo?: () => HTMLElement | null;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

/** The layer a surface is rendered inside, if any — how nesting is inferred. */
const ParentLayerContext = createContext<string | undefined>(undefined);

function usePopoverContext(component: string): PopoverContextValue {
  const context = useContext(PopoverContext);
  if (!context) throw new Error(`<${component}> must be rendered inside <Popover>.`);
  return context;
}

/**
 * For content that closes itself after doing something (§19.95's "selection").
 *
 * The reason matters: a Tag picker has already committed each toggle and
 * dismissal means nothing to it, while a draft Reminder form keeps its draft
 * on `selection` and discards it on `outside-pointer`.
 */
export function usePopoverSurface(): { close: (reason?: DismissReason) => void } {
  const context = usePopoverContext("usePopoverSurface");
  return useMemo(
    () => ({ close: (reason: DismissReason = "selection") => context.close(reason) }),
    [context],
  );
}

export interface PopoverProps {
  children: ReactNode;
  /** §19.2's interaction character, not the feature's name. */
  type?: LayerType;
  /** §19.74. Supply it for anything opened from a Task's Detail. */
  ownerTaskId?: string;
  /** §19.11's per-feature preference; flip may overrule it. */
  placement?: Placement;
  offset?: number;
  /**
   * Told why it closed, after it has closed (§19.94).
   *
   * §19.95: this is not a cancel signal. A feature that keeps a draft decides
   * that here, from the reason.
   */
  onDismiss?: (reason: DismissReason) => void;
  /**
   * §19.32's stable fallback, for when the trigger is gone by the time the
   * surface closes — a Task switch unmounts the property row the popover was
   * hanging from. Without it, focus lands on the body and the next Tab starts
   * from the top of the document.
   */
  restoreFocusTo?: () => HTMLElement | null;
}

export function Popover({
  children,
  type = "popover",
  ownerTaskId,
  placement = "bottom-start",
  offset,
  onDismiss,
  restoreFocusTo,
}: PopoverProps) {
  const layers = useFloatingLayers();
  const parentId = useContext(ParentLayerContext);
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const openedByKeyboard = useRef(false);

  // Held in refs so the registration handed to the manager never goes stale
  // while also never being a reason to re-register.
  const dismissCallback = useRef(onDismiss);
  dismissCallback.current = onDismiss;
  const restoreCallback = useRef(restoreFocusTo);
  restoreCallback.current = restoreFocusTo;

  /**
   * Focus restoration (§19.32), run for every way of closing rather than only
   * for the ones this component initiates — Escape, an outside click and a
   * Task switch all arrive from the manager, and all three leave focus inside
   * a surface that is about to be removed.
   */
  const restoreFocus = useCallback(() => {
    const trigger = triggerRef.current;
    const surface = surfaceRef.current;
    const inside = surface?.contains(document.activeElement) ?? false;
    // Only when focus is actually in the surface. Stealing it back after the
    // user has clicked somewhere else would be a popover fighting them for the
    // caret they just placed.
    if (!inside) return;
    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }
    restoreCallback.current?.()?.focus();
  }, []);

  /** What closing does locally, wherever the decision came from. */
  const finish = useCallback(
    (reason: DismissReason) => {
      restoreFocus();
      setOpen(false);
      dismissCallback.current?.(reason);
    },
    [restoreFocus],
  );

  /**
   * Closing goes THROUGH the manager, which then calls `finish` back.
   *
   * Not both directly: the manager has to be the one that decides, because
   * closing this layer also closes anything nested inside it, and a feature
   * that heard about its own dismissal twice would run whatever it does on
   * dismissal twice with it.
   */
  const close = useCallback(
    (reason: DismissReason) => {
      if (!layers.closeLayer(id, reason)) finish(reason);
    },
    [finish, id, layers],
  );

  const toggle = useCallback(
    (fromKeyboard: boolean) => {
      if (open) {
        // §19.29: the same trigger again closes it.
        close("trigger-toggle");
        return;
      }
      openedByKeyboard.current = fromKeyboard;
      setOpen(true);
    },
    [close, open],
  );

  // Registration is an effect rather than part of `toggle`, so that the
  // manager learns about the layer only once the surface exists to be asked
  // "was the pointer inside you?".
  useEffect(() => {
    if (!open) return;
    layers.openLayer(
      { id, type, parentId, ownerTaskId },
      {
        surface: () => surfaceRef.current,
        trigger: () => triggerRef.current,
        dismiss: finish,
      },
    );
    return () => layers.releaseLayer(id);
    // `layers` is stable apart from the stack it carries; re-registering on
    // every stack change would push this layer to the top each time any other
    // layer moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, type, parentId, ownerTaskId, finish]);

  const value = useMemo<PopoverContextValue>(
    () => ({ id, open, toggle, close, placement, offset, triggerRef, surfaceRef, openedByKeyboard }),
    [id, open, toggle, close, placement, offset],
  );

  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

export interface PopoverTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/**
 * The control the surface belongs to (§19.8, §19.89).
 *
 * A real `<button>`, not a div with a click handler: `aria-expanded` on
 * something with no role tells a screen reader nothing, and §19.99 forbids
 * hover-only affordances for the same reason.
 */
export function PopoverTrigger({ children, onClick, ...rest }: PopoverTriggerProps) {
  const { open, toggle, triggerRef, id } = usePopoverContext("PopoverTrigger");
  return (
    <button
      {...rest}
      ref={triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? `${id}-surface` : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // A click synthesised from Enter or Space reports no pointer detail.
        // That is the difference §19.31 turns on: a keyboard user needs focus
        // moved into the surface, a mouse user is already pointing at it.
        toggle(event.detail === 0);
      }}
    >
      {children}
    </button>
  );
}

export interface PopoverContentProps {
  children: ReactNode;
  /** Announced as the surface's name (§19.88, §19.91). */
  label: string;
  className?: string;
  role?: "dialog" | "menu" | "listbox";
  /**
   * Who gets focus when the surface opens.
   *
   * `auto` is §19.31 as written: focus moves inside for a keyboard open and
   * stays on the trigger for a mouse one, so clicking a flag does not take the
   * caret out of a Title someone was editing.
   *
   * `always` is the escape hatch the same section allows for widget semantics.
   * A picker whose first control is a search field needs it — §13.27 says
   * typing filters, and a field that must be clicked before it will accept
   * what someone is already typing is a search field in name only.
   */
  focusOnOpen?: "auto" | "always";
}

export function PopoverContent({
  children,
  label,
  className,
  role = "dialog",
  focusOnOpen = "auto",
}: PopoverContentProps) {
  const context = usePopoverContext("PopoverContent");
  const { id, open, placement, offset, surfaceRef, triggerRef, openedByKeyboard, close } = context;
  const layers = useFloatingLayers();
  const motionEnabled = useMotionEnabled();

  const anchor = useCallback(() => triggerRef.current, [triggerRef]);
  const surface = useCallback(() => surfaceRef.current, [surfaceRef]);

  // §19.19's optional policy, taken: a surface still hanging in mid-air after
  // its trigger has scrolled out of the Detail is §19.99's stale floating UI.
  const onAnchorHidden = useCallback(() => close("navigation"), [close]);

  const position = useFloatingPosition({ open, anchor, surface, placement, offset, onAnchorHidden });

  // §19.31, and it waits for `position`.
  //
  // Not an optimisation — a correctness fix found in a browser. The surface is
  // `visibility: hidden` until the first measurement lands, and focusing a
  // hidden element is a no-op the DOM reports no error for. So the focus was
  // silently dropped and the reader was left on the trigger, being told a
  // dialog had opened. jsdom does not model visibility, so the unit tests
  // could not see it.
  useEffect(() => {
    if (!open || !position) return;
    if (focusOnOpen === "auto" && !openedByKeyboard.current) return;
    const candidates = surfaceRef.current?.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]",
    );
    // `tabindex="-1"` is excluded even on a `<button>`, which the plain
    // selector would have matched. A single-select list built the ARIA way
    // gives every option except the current one a -1, so taking the first
    // element in document order would enter at the top of the list rather than
    // at the value that is already chosen — and then the first arrow press
    // would look like it had skipped one.
    const first = candidates
      ? Array.from(candidates).find((el) => el.getAttribute("tabindex") !== "-1")
      : undefined;
    // The surface itself as the fallback, so an empty or loading popover
    // (§19.81, §19.82) does not leave focus behind on the trigger while the
    // reader is told a dialog opened.
    (first ?? surfaceRef.current)?.focus();
  }, [open, position, focusOnOpen, openedByKeyboard, surfaceRef]);

  // Rendered conditionally rather than kept mounted and hidden. kit's Popover
  // learned this the hard way: an exit-animated node stayed in the tree at
  // opacity 0 with pointer events on, and swallowed the clicks aimed at what
  // it had been covering.
  if (!open || !layers.portalRoot) return null;

  return createPortal(
    <ParentLayerContext.Provider value={id}>
      <div
        ref={surfaceRef}
        id={`${id}-surface`}
        role={role}
        aria-label={label}
        tabIndex={-1}
        className={`ff-layer${className ? ` ${className}` : ""}${motionEnabled ? " is-animated" : ""}`}
        data-placement={position?.placement ?? placement}
        style={{
          position: "fixed",
          left: position?.x ?? 0,
          top: position?.y ?? 0,
          maxWidth: position?.maxWidth,
          maxHeight: position?.maxHeight,
          zIndex: layers.zIndex(id),
          // §19.61: nothing about the entrance depends on the measurement, so
          // there is no frame where a half-animated surface sits in the wrong
          // place. Until the first measurement it is simply not painted.
          visibility: position ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </ParentLayerContext.Provider>,
    layers.portalRoot,
  );
}
