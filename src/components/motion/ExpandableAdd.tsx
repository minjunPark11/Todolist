import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { reducedTransition, transitions } from "../../motion/transitions";
import { useMotionEnabled } from "../../motion/reducedMotion";

type ExpandableAddProps = {
  label: string;
  placeholder: string;
  submitLabel: string;
  className?: string;
  keepOpenAfterSubmit?: boolean;
  onSubmit: (title: string) => void;
};

export function ExpandableAdd({
  label,
  placeholder,
  submitLabel,
  className = "",
  keepOpenAfterSubmit = true,
  onSubmit,
}: ExpandableAddProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const motionEnabled = useMotionEnabled();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setTitle("");
    setOpen(keepOpenAfterSubmit);
  }

  const classes = ["expandable-add", className].filter(Boolean).join(" ");

  return (
    <motion.div
      layout={motionEnabled}
      className={classes}
      data-state={open ? "expanded" : "collapsed"}
      transition={motionEnabled ? transitions.spring : reducedTransition}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {open ? (
          <motion.form
            key="input"
            layout={motionEnabled}
            className="expandable-add-input-row"
            initial={motionEnabled ? { opacity: 0 } : false}
            animate={motionEnabled ? { opacity: 1 } : undefined}
            exit={motionEnabled ? { opacity: 0 } : undefined}
            transition={motionEnabled ? transitions.fast : reducedTransition}
            onSubmit={submit}
          >
            <input
              ref={inputRef}
              value={title}
              placeholder={placeholder}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (!title.trim()) setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setTitle("");
                  setOpen(false);
                }
              }}
            />
            <button type="submit" disabled={!title.trim()}>
              {submitLabel}
            </button>
          </motion.form>
        ) : (
          <motion.button
            key="button"
            layout={motionEnabled}
            type="button"
            initial={motionEnabled ? { opacity: 0 } : false}
            animate={motionEnabled ? { opacity: 1 } : undefined}
            exit={motionEnabled ? { opacity: 0 } : undefined}
            transition={motionEnabled ? transitions.fast : reducedTransition}
            onClick={() => setOpen(true)}
          >
            {label}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

