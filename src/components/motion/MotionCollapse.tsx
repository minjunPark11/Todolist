import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { useMotionEnabled } from "../../motion/reducedMotion";

type MotionCollapseProps = {
  open: boolean;
  className?: string;
  children: ReactNode;
};

// Height-auto expand/collapse for toggleable sections (sidebar shortcuts,
// panel groups). The wrapper owns overflow clipping; children keep their own
// layout untouched.
export function MotionCollapse({ open, className, children }: MotionCollapseProps) {
  const motionEnabled = useMotionEnabled();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={className}
          style={{ overflow: "hidden" }}
          initial={motionEnabled ? { height: 0, opacity: 0 } : false}
          animate={motionEnabled ? { height: "auto", opacity: 1 } : undefined}
          exit={motionEnabled ? { height: 0, opacity: 0 } : undefined}
          transition={motionEnabled ? transitions.soft : reducedTransition}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
