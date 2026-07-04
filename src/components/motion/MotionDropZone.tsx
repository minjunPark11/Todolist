import type { DragEventHandler, ReactNode } from "react";
import { motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { dropZoneVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

type MotionDropZoneProps = {
  as?: "section" | "div";
  isOver: boolean;
  className?: string;
  children: ReactNode;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
};

export function MotionDropZone({
  as = "div",
  isOver,
  className = "",
  children,
  onDragOver,
  onDragLeave,
  onDrop,
}: MotionDropZoneProps) {
  const motionEnabled = useMotionEnabled();
  const Component = as === "section" ? motion.section : motion.div;
  const classes = ["motion-drop-zone", className, isOver ? "is-over" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Component
      variants={motionEnabled ? dropZoneVariants : undefined}
      animate={motionEnabled ? (isOver ? "over" : "idle") : undefined}
      transition={motionEnabled ? transitions.fast : reducedTransition}
      className={classes}
      onDragOver={onDragOver as never}
      onDragLeave={onDragLeave as never}
      onDrop={onDrop as never}
    >
      {children}
    </Component>
  );
}

