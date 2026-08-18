// Keeping Tab inside a surface that covers what is behind it, and putting
// focus back where it came from when the surface goes.
//
// Extracted at the third caller rather than copied a third time. It existed
// twice already — the Task Drawer and the Goal drawer — and a trap is exactly
// the kind of thing that drifts once duplicated: one copy learns about a new
// focusable element or a disabled state and the other does not, so two
// surfaces in one app disagree about whether Tab can escape them.
import { useEffect, type RefObject } from "react";

/**
 * What counts as a stop on the way round.
 *
 * `:not([disabled])` on buttons is the part worth stating: a dialog that
 * disables its own submit while submitting would otherwise trap focus on a
 * control that cannot be pressed.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  /** Off for a surface that sits BESIDE its content rather than over it. */
  enabled?: boolean;
  /**
   * Focus this on mount. Omit to take the first focusable thing.
   *
   * The Add List dialog names its Name field here: §9.2 requires typing to
   * work immediately, and the first focusable element in DOM order is not
   * always the one the user came to use.
   */
  initial?: () => HTMLElement | null | undefined;
}

export function useFocusTrap(
  root: RefObject<HTMLElement | null>,
  { enabled = true, initial }: FocusTrapOptions = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    // Captured before anything is focused, so it is the element that actually
    // opened this and not something the surface itself moved focus to.
    const opener = document.activeElement as HTMLElement | null;
    const node = root.current;
    (initial?.() ?? node?.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restoring focus is what makes closing feel like coming back rather
      // than like landing at the top of the page. If the opener has since left
      // the DOM — a List deleted on another device, a tree that re-rendered —
      // `focus()` on a detached node does nothing, and the browser's own
      // fallback to <body> is better than guessing at a replacement.
      opener?.focus?.();
    };
  }, [enabled, root, initial]);
}
