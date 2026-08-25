// The floating layer domain's public surface (spec §19.70, §19.71).
//
// §19.70's FloatingLayerManager, minus React: the registry, the ordering rules
// and the positioning engine live here, and the components in
// `src/components/floating` are the part that touches the DOM. §19.71 draws
// the other boundary — nothing in this folder knows what a Priority option is,
// what a Tag means, or that Tasks exist at all.
export type {
  Align,
  DismissReason,
  Layer,
  LayerType,
  Placement,
  Rect,
  Side,
  Size,
} from "./types";
export {
  alignOf,
  computePlacement,
  DEFAULT_COLLISION_PADDING,
  DEFAULT_OFFSET,
  isAnchorHidden,
  sideOf,
  type PlacementInput,
  type PlacementResult,
} from "./placement";
export {
  ancestorIds,
  descendantIds,
  dismissedByPointer,
  isManaged,
  orphanedByOwner,
  pushLayer,
  removeLayer,
  topDismissable,
  zIndexOf,
} from "./layerStack";
export { Z, zIndexFor } from "./zIndex";
