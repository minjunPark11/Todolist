import { motionDistance, motionScale } from "./tokens";

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

