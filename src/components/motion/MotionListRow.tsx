// A line in a list that can arrive and be taken away.
//
// `MotionTaskRow` is the CARD's version of this and could not be reused for
// two reasons, both structural. It renders a `div`, and a list's children have
// to be `li` or the list stops being one to a screen reader. And it grows 1%
// under the pointer, which is a card's affordance: a card is an object you
// could pick up, a 36px line in a dense list that swells as the pointer
// crosses it is a list that ripples.
//
// What this exists for is the moment a row is ticked. The row leaves the
// Scope's rows the instant it is finished (§12.4), so with no exit it is
// simply gone between two frames — and the complaint that started this was
// exactly that: a row that vanishes leaves the reader unable to tell which one
// they checked. Here it fades, and `layout` carries the rows below it up into
// the gap rather than teleporting them.
import type { DragEventHandler, MouseEventHandler, ReactNode } from "react";
import { motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { listRowVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

export function MotionListRow({
  taskId,
  className = "",
  draggable,
  children,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onContextMenu,
}: {
  taskId: string;
  className?: string;
  draggable?: boolean;
  children: ReactNode;
  onDragStart?: DragEventHandler<HTMLLIElement>;
  onDragOver?: DragEventHandler<HTMLLIElement>;
  onDrop?: DragEventHandler<HTMLLIElement>;
  onDragEnd?: DragEventHandler<HTMLLIElement>;
  onContextMenu?: MouseEventHandler<HTMLLIElement>;
}) {
  const motionEnabled = useMotionEnabled();

  return (
    <motion.li
      // Not the React key — this is what the layout animation matches a row to
      // across renders, and what a test can find one by.
      data-task-id={taskId}
      // "position" and not the full layout animation: the rows below a removed
      // one MOVE, they do not change shape, and animating their size as well
      // makes a list of one-line rows breathe every time one of them goes.
      layout={motionEnabled ? "position" : false}
      variants={motionEnabled ? listRowVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.layout : reducedTransition}
      className={className}
      draggable={draggable}
      // The native HTML5 drag handlers, which framer-motion's own `drag` props
      // shadow in the types. The Board's row casts them the same way.
      onDragStart={onDragStart as never}
      onDragOver={onDragOver as never}
      onDrop={onDrop as never}
      onDragEnd={onDragEnd as never}
      onContextMenu={onContextMenu}
    >
      {children}
    </motion.li>
  );
}
