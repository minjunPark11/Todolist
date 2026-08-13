// Multi-select state (USABILITY_IMPROVEMENT_DESIGN.md §7).
//
// Kept as plain data so the click rules — plain click, toggle, shift-range —
// are testable without a renderer. `anchor` is the last row the user touched
// directly; a shift-click extends from there, the way file lists behave.

export interface SelectionState {
  ids: string[];
  anchor: string;
}

export const emptySelection: SelectionState = { ids: [], anchor: "" };

export function isSelected(state: SelectionState, id: string): boolean {
  return state.ids.includes(id);
}

/** Replaces the selection with this row alone. */
export function selectOnly(state: SelectionState, id: string): SelectionState {
  if (state.ids.length === 1 && state.ids[0] === id) return state;
  return { ids: [id], anchor: id };
}

export function toggleSelected(state: SelectionState, id: string): SelectionState {
  const ids = isSelected(state, id)
    ? state.ids.filter((candidate) => candidate !== id)
    : [...state.ids, id];
  // The anchor follows the row just touched, even when deselecting, so a
  // following shift-click extends from where the user actually is.
  return { ids, anchor: id };
}

/**
 * Adds every row between the anchor and `id` in `orderedIds`. With no anchor
 * yet — or an anchor that has since disappeared — this behaves like a plain
 * click rather than selecting nothing.
 */
export function selectRange(
  state: SelectionState,
  id: string,
  orderedIds: string[],
): SelectionState {
  const anchorIndex = orderedIds.indexOf(state.anchor);
  const targetIndex = orderedIds.indexOf(id);
  if (targetIndex === -1) return state;
  if (anchorIndex === -1) return selectOnly(state, id);

  const [from, to] =
    anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  const range = orderedIds.slice(from, to + 1);
  const ids = [...state.ids];
  for (const candidate of range) {
    if (!ids.includes(candidate)) ids.push(candidate);
  }
  // The anchor stays put so repeated shift-clicks grow from the same origin.
  return { ids, anchor: state.anchor };
}

export function clearSelection(state: SelectionState): SelectionState {
  return state.ids.length === 0 && !state.anchor ? state : emptySelection;
}

/** Drops ids that are no longer in the list (archived, deleted, filtered out). */
export function pruneSelection(state: SelectionState, orderedIds: string[]): SelectionState {
  const ids = state.ids.filter((id) => orderedIds.includes(id));
  const anchor = orderedIds.includes(state.anchor) ? state.anchor : "";
  if (ids.length === state.ids.length && anchor === state.anchor) return state;
  return { ids, anchor };
}

export function selectAll(orderedIds: string[]): SelectionState {
  return { ids: [...orderedIds], anchor: orderedIds[orderedIds.length - 1] ?? "" };
}
