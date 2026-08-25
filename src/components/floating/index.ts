// The floating layer system's React surface (spec §19.72).
//
// A feature imports from here and nothing deeper. The provider and the
// positioning hook are the mechanism; `Popover`, `PopoverTrigger` and
// `PopoverContent` are what a feature composes.
export {
  FloatingLayerProvider,
  useFloatingLayerOwner,
  useFloatingLayers,
  type LayerRegistration,
} from "./FloatingLayerProvider";
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopoverSurface,
  type PopoverContentProps,
  type PopoverProps,
  type PopoverTriggerProps,
} from "./Popover";
export { FloatingMenu, type FloatingMenuProps } from "./FloatingMenu";
export { moveMenuFocus } from "./menuNavigation";
export {
  rectOfElement,
  rectOfPoint,
  useFloatingPosition,
  type FloatingPositionOptions,
} from "./useFloatingPosition";
