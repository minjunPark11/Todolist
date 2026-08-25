// Which surface is on top, and what one Escape closes (spec §19.23–§19.27,
// §19.92–§19.94).
//
// §19.92 is the whole reason this file exists: "Esc handler를 각 feature에서
// 제각각 window에 등록하지 않는다". The app does exactly that today — the
// Drawer, the ContextMenu, kit's `useOutsideClose` and the Command Menu each
// add their own document listener — and the result is the bug §19.99 lists as
// prohibited, one Escape collapsing several layers at once. ContextMenu had
// already patched around it with `stopPropagation`, which works only because
// it happens to be the only nested case that exists so far.
//
// The stack is ordinary data and every function here is pure, so the ordering
// rules can be tested without a DOM, a React tree, or an open window.
import type { Layer, LayerType } from "./types";
import { zIndexFor } from "./zIndex";

/**
 * Surfaces that §19.23 and §19.69 forbid as siblings: opening one closes any
 * other that is open at the same level.
 *
 * Tooltip is not here, and that is §19.69's "Popover + Tooltip" — a tooltip is
 * a description of something, so it can coexist with the surface it describes.
 * Overlay and Modal are not here either: they arrive ON TOP of what is open
 * rather than beside it, and §19.66 handles what happens to the layers below.
 */
const PRIMARY: readonly LayerType[] = ["popover", "menu", "context-menu"];

/**
 * Layers the central Escape and outside-click handling is responsible for.
 *
 * `toast` is absent by §19.68: a Toast is feedback, not an owned surface, and
 * closing a Popover must not take one with it. `tooltip` is absent because it
 * is driven entirely by hover and focus of its own trigger (§19.35–§19.37) —
 * if it joined the stack, a tooltip that happened to be showing would eat the
 * Escape meant for the popover underneath.
 *
 * `modal` IS managed, for ordering: Escape must reach the topmost dialog
 * rather than something beneath it. Whether a given dialog actually closes on
 * Escape stays the dialog's decision.
 */
const MANAGED: readonly LayerType[] = ["popover", "menu", "context-menu", "overlay", "modal"];

export function isManaged(type: LayerType): boolean {
  return MANAGED.includes(type);
}

function find(stack: readonly Layer[], id: string): Layer | undefined {
  return stack.find((layer) => layer.id === id);
}

/**
 * The layer's parents, nearest first.
 *
 * Cycle-safe for the same reason the Task hierarchy walks are: a malformed
 * `parentId` must not hang the window it is drawn in.
 */
export function ancestorIds(stack: readonly Layer[], id: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let current = find(stack, id)?.parentId;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = find(stack, current)?.parentId;
  }
  return chain;
}

/**
 * Every layer nested inside this one, at any depth.
 *
 * Walked to a fixpoint rather than in one pass. A single pass would be enough
 * while the array stays in open order — a parent is always pushed before its
 * child — but that is an ordering assumption a later change could quietly
 * break, and the stack is a handful of entries.
 */
export function descendantIds(stack: readonly Layer[], id: string): string[] {
  const found = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const layer of stack) {
      if (found.has(layer.id)) continue;
      if (layer.parentId && found.has(layer.parentId)) {
        found.add(layer.id);
        grew = true;
      }
    }
  }
  found.delete(id);
  return stack.filter((layer) => found.has(layer.id)).map((layer) => layer.id);
}

/**
 * Open a layer.
 *
 * A layer with a `parentId` nests, and its siblings go: §19.24 allows a
 * Schedule popover to own a Reminder sub-popover, not to own two of them.
 *
 * A layer without one is a new root, and opening it closes every primary
 * surface that was open — §19.23's "Priority open → Date trigger click →
 * Priority close, Date open", and equally §19.66's More Menu closing as the
 * Scope dialog opens, which is the same rule seen from the modal's side.
 *
 * Re-pushing an id that is already open replaces it in place rather than
 * duplicating it, so a re-render cannot stack a layer on itself.
 */
export function pushLayer(stack: readonly Layer[], layer: Layer): Layer[] {
  let next = removeLayer(stack, layer.id);
  const evicted = layer.parentId
    ? next.filter((open) => open.parentId === layer.parentId)
    : // A primary surface nested inside something else belongs to that
      // something else; only free-standing ones are siblings of a new root.
      next.filter((open) => !open.parentId && PRIMARY.includes(open.type));
  // Through `removeLayer` so an evicted surface takes its own children with
  // it. Dropping it alone would leave a sub-popover anchored to a trigger that
  // is no longer on screen — §19.99's stale floating UI, arrived at from the
  // one direction §19.20 does not cover.
  for (const open of evicted) next = removeLayer(next, open.id);
  return [...next, layer];
}

/** Close a layer, and anything nested inside it (§19.25's other direction). */
export function removeLayer(stack: readonly Layer[], id: string): Layer[] {
  const doomed = new Set<string>([id, ...descendantIds(stack, id)]);
  return stack.filter((layer) => !doomed.has(layer.id));
}

/**
 * What one Escape closes — exactly one layer (§19.25, §19.93).
 *
 * The last managed layer, because the stack is kept in open order and a child
 * is always pushed after its parent. Returns null when nothing is open, which
 * is how the Drawer underneath still gets its Escape: no layer claimed it.
 */
export function topDismissable(stack: readonly Layer[]): Layer | null {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (isManaged(stack[i].type)) return stack[i];
  }
  return null;
}

/**
 * Which layers a pointer landing on `hitLayerIds` should close, topmost first.
 *
 * `hitLayerIds` is every open layer whose surface OR trigger contains the
 * pointer target — the DOM question, which the React side answers. What counts
 * as outside is then arithmetic: a layer survives if the pointer landed in it
 * or in anything nested inside it.
 *
 * That is §19.26 and §19.27 together. Clicking a Reminder sub-popover is not
 * an outside click for the Schedule popover that owns it, and the trigger
 * counts as inside so that §19.29's toggle-close can be the trigger's own
 * business rather than a close immediately followed by a re-open.
 *
 * A Modal ends the walk. It covers what is under it, so a pointer that reached
 * the dialog was never outside anything below, and §19.55 leaves backdrop
 * dismissal to the dialog itself.
 */
export function dismissedByPointer(stack: readonly Layer[], hitLayerIds: readonly string[]): string[] {
  const safe = new Set<string>();
  for (const id of hitLayerIds) {
    safe.add(id);
    for (const parent of ancestorIds(stack, id)) safe.add(parent);
  }
  const out: string[] = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const layer = stack[i];
    if (layer.type === "modal") break;
    if (!isManaged(layer.type)) continue;
    if (!safe.has(layer.id)) out.push(layer.id);
  }
  return out;
}

/**
 * Layers belonging to a Task that is no longer the selected one (§19.21,
 * §19.74), topmost first.
 *
 * Ownership is opt-in: a layer with no `ownerTaskId` — the sidebar's own menu,
 * a global dialog — is not Task-specific and is left alone.
 */
export function orphanedByOwner(stack: readonly Layer[], selectedTaskId: string | null): string[] {
  const out: string[] = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const layer = stack[i];
    if (layer.ownerTaskId && layer.ownerTaskId !== selectedTaskId) out.push(layer.id);
  }
  return out;
}

/**
 * The stacking value for one open layer, taking its nesting into account
 * (§19.64, §19.67).
 *
 * Computed from the stack rather than passed down as a prop, because the
 * component opening a submenu does not know whether IT was opened from a menu,
 * a Detail panel or a modal — and under §19.67 that is precisely what decides
 * the number.
 */
export function zIndexOf(stack: readonly Layer[], id: string): number {
  const layer = find(stack, id);
  if (!layer) return zIndexFor("popover");
  const chain = ancestorIds(stack, id).reverse();
  let z: number | undefined;
  for (const ancestorId of chain) {
    const ancestor = find(stack, ancestorId);
    if (ancestor) z = zIndexFor(ancestor.type, z);
  }
  return zIndexFor(layer.type, z);
}
