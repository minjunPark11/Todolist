import type { Variants } from "framer-motion";
import { motionDistance, motionDurations, motionScale } from "./tokens";

export const cardVariants = {
  initial: {
    opacity: 0,
    y: motionDistance.cardY,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.96,
  },
};

export const draggingCardVariants = {
  idle: {
    scale: 1,
    y: 0,
  },
  dragging: {
    scale: motionScale.drag,
    y: -2,
  },
};

export const taskRowVariants = {
  ...cardVariants,
  ...draggingCardVariants,
};

export const dropZoneVariants = {
  idle: {
    scale: 1,
    opacity: 1,
  },
  over: {
    scale: motionScale.hover,
    opacity: 1,
  },
};

export const popoverVariants = {
  initial: {
    opacity: 0,
    y: -4,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.98,
  },
};

export const panelVariants = {
  initial: {
    opacity: 0,
    x: motionDistance.panelX,
    scale: motionScale.panel,
  },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    x: 24,
    scale: motionScale.panel,
  },
};

export const backdropVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
    transition: { duration: motionDurations.fast, ease: [0.2, 0, 0, 1] },
  },
};

// Page-level crossfade for main navigation. Opacity only: a transform on
// <main> would become the containing block for position:fixed children
// (modal backdrops, popovers) while the transition runs.
export const pageVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    y: motionDistance.modalY,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  // Dismissal should feel quicker than entry, so the exit carries its own
  // fast transition instead of the modal's soft enter transition.
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.98,
    transition: { duration: motionDurations.fast, ease: [0.2, 0, 0, 1] },
  },
};

export const toastVariants = {
  initial: {
    opacity: 0,
    y: motionDistance.modalY,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: 8,
  },
};

export const calendarBlockVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
  },
};

export const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.06,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const staggerItem = {
  initial: {
    opacity: 0,
    y: motionDistance.cardY,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: 4,
  },
};

/**
 * A line in a list arriving and leaving.
 *
 * No scale, unlike `cardVariants`: a card is an object, a row is a line of a
 * page, and a line that shrinks as it goes reads as a rendering fault rather
 * than as a departure. The exit is faster than the entry because by then the
 * row has already been acted on — what is worth watching is the gap closing
 * behind it, not the row itself.
 */
export const listRowVariants: Variants = {
  initial: {
    opacity: 0,
    y: -motionDistance.popoverY,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    transition: { duration: motionDurations.fast, ease: [0.2, 0, 0, 1] },
  },
};
