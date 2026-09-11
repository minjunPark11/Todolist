// How wide the Task Detail pane is (spec §1.11–§1.14).
//
// Pure, so the rules are testable without a DOM — the same split the Context
// Sidebar uses, and for the same reason. The React state that drives it is
// `hooks/useTaskDetailWidth.ts`.
//
// §1.14 is the one decision worth naming: the width is a UI PREFERENCE, not
// Task data. It describes how this person likes to read, so it belongs beside
// the sidebar's width and not on a record that syncs to every device and every
// collaborator.

/**
 * §1.12's constraint was 360–600. The floor comes down to the reference's
 * width (POLISHED_REFERENCE_PARITY_DESIGN.md §4.7).
 *
 * The mockup's inspector is 320 and has no handle at all. Taking the handle
 * away is the part this does NOT do: the width is a stored preference (§1.14),
 * and dropping it would throw away something the person set, which is a bigger
 * thing than the 160px this is about. So the DEFAULT moves and the range opens
 * far enough to hold it — the first screen matches the reference to the pixel,
 * and anyone who wants it wider still drags it wider.
 */
export const TASK_DETAIL_MIN_WIDTH = 320;
export const TASK_DETAIL_MAX_WIDTH = 600;

/**
 * The reference's 320 (§2.6).
 *
 * It was 480 — "wide enough for a Title and a property row on one line". That
 * reasoning survives the change: at 320 the reference puts the label and the
 * value on one line too, in a `64px | 1fr` grid that is narrower than the row
 * this replaced because the label column is fixed rather than fluid.
 */
export const TASK_DETAIL_DEFAULT_WIDTH = 320;

/** §1.13's arrow-key step, matching the sidebar's so the two handles agree. */
export const TASK_DETAIL_STEP = 16;
export const TASK_DETAIL_BIG_STEP = 32;

export const TASK_DETAIL_WIDTH_KEY = "focusflow-task-detail-width";

/**
 * §1.12: dragging past either end stops there.
 *
 * A non-finite value recovers to the default rather than propagating: `NaN`
 * would flow into a CSS length, and a pane with no width is a pane that has
 * silently closed.
 */
export function clampTaskDetailWidth(width: number): number {
  if (!Number.isFinite(width)) return TASK_DETAIL_DEFAULT_WIDTH;
  return Math.min(TASK_DETAIL_MAX_WIDTH, Math.max(TASK_DETAIL_MIN_WIDTH, Math.round(width)));
}

/**
 * A stored width, or the default when there is nothing usable.
 *
 * Missing, corrupt and out-of-range all recover the same way. A pane stuck at
 * a width nobody can see is worse than one that forgot a preference.
 */
export function readStoredDetailWidth(raw: string | null): number {
  if (raw === null) return TASK_DETAIL_DEFAULT_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return TASK_DETAIL_DEFAULT_WIDTH;
  return clampTaskDetailWidth(parsed);
}

/**
 * The width one keypress produces, or null for a key this does not handle.
 *
 * The DIRECTION is inverted relative to the sidebar's, and that is not a slip.
 * This handle is on the pane's LEFT edge (§1.12), so dragging or pressing left
 * makes the pane WIDER, while the sidebar's right-edge handle makes it
 * narrower. Matching the sidebar's arithmetic here would make the arrow keys
 * disagree with the drag they are meant to replace.
 */
export function detailWidthAfterKey(width: number, key: string, shift: boolean): number | null {
  const step = shift ? TASK_DETAIL_BIG_STEP : TASK_DETAIL_STEP;
  switch (key) {
    case "ArrowLeft":
      return clampTaskDetailWidth(width + step);
    case "ArrowRight":
      return clampTaskDetailWidth(width - step);
    case "Home":
      return TASK_DETAIL_MAX_WIDTH;
    case "End":
      return TASK_DETAIL_MIN_WIDTH;
    default:
      return null;
  }
}

/**
 * The width a drag of `deltaX` from `startWidth` produces.
 *
 * Negative delta — the pointer moving left — widens, for the reason above.
 */
export function detailWidthAfterDrag(startWidth: number, deltaX: number): number {
  return clampTaskDetailWidth(startWidth - deltaX);
}
