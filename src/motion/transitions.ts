import type { Transition } from "framer-motion";

export const transitions = {
  fast: {
    duration: 0.16,
    ease: [0.2, 0, 0, 1],
  },
  soft: {
    duration: 0.28,
    ease: [0.2, 0, 0, 1],
  },
  panel: {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1],
  },
  spring: {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.8,
  },
  layout: {
    type: "spring",
    stiffness: 500,
    damping: 38,
    mass: 0.7,
  },
  drag: {
    type: "spring",
    stiffness: 520,
    damping: 42,
    mass: 0.65,
  },
} satisfies Record<string, Transition>;

export const reducedTransition: Transition = { duration: 0.01 };

