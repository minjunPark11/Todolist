import { useReducedMotion } from "framer-motion";

export function getAppReducedMotion() {
  return document.documentElement.dataset.reduceMotion === "true";
}

export function useMotionEnabled() {
  const osReducedMotion = useReducedMotion();
  return !getAppReducedMotion() && !osReducedMotion;
}

