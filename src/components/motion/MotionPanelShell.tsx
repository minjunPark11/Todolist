import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { panelVariants, staggerContainer } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

type MotionPanelShellProps = {
  className?: string;
  children: ReactNode;
};

export function MotionPanelShell({ className = "", children }: MotionPanelShellProps) {
  const motionEnabled = useMotionEnabled();
  const classes = ["motion-panel-shell", className].filter(Boolean).join(" ");

  return (
    <motion.aside
      className={classes}
      variants={motionEnabled ? panelVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.panel : reducedTransition}
    >
      <motion.div
        variants={motionEnabled ? staggerContainer : undefined}
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? "animate" : undefined}
        exit={motionEnabled ? "exit" : undefined}
      >
        {children}
      </motion.div>
    </motion.aside>
  );
}

