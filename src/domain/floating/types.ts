// The vocabulary the floating layer system is written in (spec §19.2, §19.9,
// §19.11, §19.94).
//
// These are shared by the positioning math and the layer stack, and neither of
// those imports React. §19.71 draws the line this file sits on: the layer
// system owns surface mechanics — where a surface goes, which one Escape
// closes — and knows nothing about what a Priority option or a Tag means.

/**
 * A rectangle in VIEWPORT coordinates, which is what `getBoundingClientRect`
 * returns and what the positioning math assumes throughout.
 *
 * Not document coordinates. The distinction matters because §19.19 recomputes
 * on scroll: in viewport space a scroll changes the anchor's rect and the math
 * re-runs unchanged, whereas document space would need the scroll offset
 * threaded through every calculation to say the same thing.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Which side of the anchor the surface prefers to sit on (§19.11). */
export type Side = "top" | "bottom" | "left" | "right";

/**
 * Where it lines up along that side.
 *
 * `start` and `end` are reading-order edges rather than left/right, so a
 * `bottom-start` popover hangs from the anchor's leading edge.
 */
export type Align = "start" | "center" | "end";

/** e.g. `bottom-start` for a Date picker, `bottom-end` for a More menu. */
export type Placement = `${Side}-${Align}`;

/**
 * What kind of surface this is (§19.2).
 *
 * Deliberately interaction character, not feature: Priority and Tag pickers
 * are both `popover` because they dismiss, focus and stack identically, and
 * the thing that differs between them — their content — is the feature's.
 */
export type LayerType =
  | "tooltip"
  | "popover"
  | "menu"
  | "context-menu"
  | "overlay"
  | "modal"
  | "toast";

/**
 * Why a surface closed (§19.94).
 *
 * Passed to the close callback because §19.95 is explicit that dismissal is
 * not cancellation: a Tag picker has already committed each toggle and does
 * not care, while a draft Reminder form discards on `outside-pointer` and
 * keeps on `selection`. The layer system reports the reason; the feature
 * decides what it means.
 */
export type DismissReason =
  | "escape"
  | "outside-pointer"
  | "selection"
  | "trigger-toggle"
  | "owner-unmounted"
  | "navigation";

/**
 * One open surface (§19.22).
 *
 * `parentId` is what makes nesting real rather than two unrelated popovers
 * that happen to overlap: it is how §19.25 knows one Escape closes the child
 * and leaves the parent, and how §19.26 knows a click inside the child is not
 * an outside click for the parent.
 *
 * `ownerTaskId` is §19.74 — the Task whose Detail opened this. When the
 * selection moves on, a layer belonging to the Task that is no longer shown
 * has nothing left to act on (§19.21).
 */
export interface Layer {
  id: string;
  type: LayerType;
  parentId?: string;
  ownerTaskId?: string;
}
