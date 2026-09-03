// Arrow keys inside a menu (spec §19.39).
//
// Shared by both menus the app has — the pointer-anchored `FloatingMenu` and
// the trigger-anchored `PopoverContent role="menu"` — because §19.39 is one
// rule and two copies of it drift. It drifted once already: the old
// ContextMenu wrapped at the ends and kit's MoreMenu had no arrow keys at all,
// so the same gesture did different things depending on which menu was open.
import type { KeyboardEvent } from "react";

/**
 * Move focus to the next or previous item, wrapping at both ends.
 *
 * Wraps because a menu is a ring in the ARIA pattern, and stopping dead at the
 * last item reads as the key having failed rather than as a boundary.
 *
 * Returns whether the key was handled, so the caller can leave every other key
 * alone — a menu that swallowed keys it did not use would take Tab with it,
 * and §19.33 wants Tab to keep working.
 */
export function moveMenuFocus(container: HTMLElement | null, event: KeyboardEvent): boolean {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
  // All three menu-item roles, not just the plain one: a menu that holds a
  // set of choices draws them as `menuitemradio`, and walking only
  // `menuitem` would step straight over the very row a keyboard reader came
  // to change (the Tasks Module's View picker).
  const items = Array.from(
    container?.querySelectorAll<HTMLElement>(
      "[role='menuitem'],[role='menuitemradio'],[role='menuitemcheckbox']",
    ) ?? [],
  );
  if (items.length === 0) return false;
  event.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = event.key === "ArrowDown" ? at + 1 : at - 1;
  // An `at` of -1 — focus is on the surface itself, which is where it lands
  // when the menu has just opened — steps to 0 for Down and to the last item
  // for Up, which is what both keys should do from nowhere in particular.
  items[(next + items.length) % items.length].focus();
  return true;
}
