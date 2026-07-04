import type {
  CSSProperties,
  DragEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";
import { motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { dropZoneVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

type MotionDropZoneProps = {
  as?: "section" | "div";
  isOver: boolean;
  className?: string;
  style?: CSSProperties;
  animateTransform?: boolean;
  children: ReactNode;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  onClick?: MouseEventHandler<HTMLElement>;
  onDoubleClick?: MouseEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onPointerMove?: PointerEventHandler<HTMLElement>;
  onPointerUp?: PointerEventHandler<HTMLElement>;
  onPointerCancel?: PointerEventHandler<HTMLElement>;
};

export function MotionDropZone({
  as = "div",
  isOver,
  className = "",
  style,
  animateTransform = true,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: MotionDropZoneProps) {
  const motionEnabled = useMotionEnabled();
  const Component = as === "section" ? motion.section : motion.div;
  const classes = ["motion-drop-zone", className, isOver ? "is-over" : ""]
    .filter(Boolean)
    .join(" ");
  const variants = animateTransform
    ? dropZoneVariants
    : {
        idle: { opacity: 1 },
        over: { opacity: 1 },
      };

  return (
    <Component
      variants={motionEnabled ? variants : undefined}
      animate={motionEnabled ? (isOver ? "over" : "idle") : undefined}
      transition={motionEnabled ? transitions.fast : reducedTransition}
      className={classes}
      style={style}
      onDragOver={onDragOver as never}
      onDragLeave={onDragLeave as never}
      onDrop={onDrop as never}
      onClick={onClick as never}
      onDoubleClick={onDoubleClick as never}
      onPointerDown={onPointerDown as never}
      onPointerMove={onPointerMove as never}
      onPointerUp={onPointerUp as never}
      onPointerCancel={onPointerCancel as never}
    >
      {children}
    </Component>
  );
}
