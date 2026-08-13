import type { DragEventHandler, KeyboardEventHandler, ReactNode } from "react";
import { motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { motionScale } from "../../motion/tokens";
import { taskRowVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

type MotionTaskRowProps = {
  taskId: string;
  isDragging?: boolean;
  className?: string;
  draggable?: boolean;
  title?: string;
  role?: string;
  tabIndex?: number;
  children: ReactNode;
  onClick?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onNativeDragStart?: DragEventHandler<HTMLDivElement>;
  onNativeDragEnd?: DragEventHandler<HTMLDivElement>;
};

export function MotionTaskRow({
  taskId,
  isDragging = false,
  className = "",
  draggable,
  title,
  role,
  tabIndex,
  children,
  onClick,
  onKeyDown,
  onNativeDragStart,
  onNativeDragEnd,
}: MotionTaskRowProps) {
  const motionEnabled = useMotionEnabled();
  const classes = ["motion-task-row", className, isDragging ? "is-dragging" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.div
      data-task-id={taskId}
      layout={motionEnabled ? "position" : false}
      variants={motionEnabled ? taskRowVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? (isDragging ? "dragging" : "animate") : undefined}
      exit={motionEnabled ? "exit" : undefined}
      whileHover={motionEnabled && !isDragging ? { scale: motionScale.hover } : undefined}
      whileTap={motionEnabled ? { scale: motionScale.tap } : undefined}
      transition={motionEnabled ? transitions.layout : reducedTransition}
      className={classes}
      draggable={draggable}
      title={title}
      role={role}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragStart={onNativeDragStart as never}
      onDragEnd={onNativeDragEnd as never}
    >
      {children}
    </motion.div>
  );
}

