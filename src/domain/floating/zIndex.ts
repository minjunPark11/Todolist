// The one place a stacking number is written down (spec §19.4, §19.5).
//
// Before this, the app had twenty-five different z-index values across the
// stylesheets and the five highest were 1200, 1300, 1400, 1500 and 1600 —
// which is the shape §19.99 names as a prohibited pattern. Numbers that large
// are not a scale, they are a record of arguments: each one was chosen to beat
// whatever was on top at the time, so the surface that wins is the file that
// was edited last rather than the one that should be in front.
//
// The gaps are deliberate. Twenty between neighbours leaves room for a nested
// child to sit above its parent (§19.64) without reaching the next category.
import type { LayerType } from "./types";

/**
 * §19.4's semantic scale. A component never writes one of these numbers; it
 * asks for its layer type.
 */
export const Z = {
  base: 0,
  sticky: 20,
  tooltip: 80,
  popover: 100,
  menu: 120,
  overlay: 200,
  modal: 300,
  toast: 400,
} as const;

const BY_TYPE: Record<LayerType, number> = {
  tooltip: Z.tooltip,
  popover: Z.popover,
  // A context menu is a menu that the pointer opened rather than a trigger;
  // §19.2 keeps them separate because their anchors differ, but they stack as
  // the same thing.
  menu: Z.menu,
  "context-menu": Z.menu,
  overlay: Z.overlay,
  modal: Z.modal,
  toast: Z.toast,
};

/**
 * How much one level of nesting adds.
 *
 * Small enough that nesting cannot climb a whole category: four levels of
 * popover reach 108 and the menu band starts at 120. Nesting that deep is
 * already a design problem; it should not also become a LAYERING problem.
 */
const NEST_STEP = 2;

/**
 * The stacking value for a layer of this type, optionally nested inside a
 * layer already at `parentZ`.
 *
 * The `max` is what makes §19.67 work. A Date popover opened from inside a
 * Modal is still a popover, and its band (100) is below the modal's (300) — so
 * taking the band alone would render it BEHIND the dialog that opened it,
 * which is the exact failure §19.67 names. Nesting therefore lifts a child to
 * just above its parent whenever the parent is already higher, and §19.64's
 * ordinary case (a submenu over its menu) falls out of the same rule.
 */
export function zIndexFor(type: LayerType, parentZ?: number): number {
  const band = BY_TYPE[type];
  return parentZ === undefined ? band : Math.max(band, parentZ + NEST_STEP);
}
