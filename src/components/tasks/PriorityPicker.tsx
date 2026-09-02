// The Priority flag and its popover (spec §8.5, §8.10, §8.25, §8.28, §8.29).
//
// The first feature built on the shared layer system, and it supplies only
// what §19.71 says a feature should: the options, and what choosing one means.
// Where the surface goes, what closes it, what it stacks above and where focus
// returns to are the primitive's.
//
// It replaces a `<select>`. That control could not show a flag, could not be
// undone, and wrote a record when the same level was picked twice.
import { useState } from "react";
import type { Task, TaskPriority } from "../../types";
import { isRovingKey, rovingNext } from "../../domain/tasks/rovingChoice";
import { NO_PRIORITY, PRIORITY_LEVELS } from "../../domain/tasks/priority";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { useT } from "../../i18n";

/**
 * §8.29: colour is supplemental.
 *
 * Each level therefore carries a glyph that differs in SHAPE, not only in
 * hue — a filled flag against an outlined one — so the three levels remain
 * distinguishable in greyscale and to a reader who cannot separate red from
 * amber. The text label beside it in the popover is the third channel.
 */
const GLYPH: Record<TaskPriority, string> = {
  high: "⚑",
  medium: "⚑",
  low: "⚑",
  none: "⚐",
};

export interface PriorityPickerProps {
  task: Task;
  /**
   * Given the chosen level. Null is never passed — a re-select is filtered by
   * `priorityChange` before it gets here (§8.8) — so a caller can treat every
   * call as a real change.
   */
  onChange: (level: TaskPriority) => void;
  /** §19.32's fallback, for when a Task switch removes the trigger. */
  restoreFocusTo?: () => HTMLElement | null;
  /**
   * Shows the level without offering to change it
   * (TRASH_PERMANENT_DELETE_DESIGN.md §14).
   *
   * The flag is a FACT here, not a control. A prop rather than a second
   * component so the name, the glyph and the sentence stay written once —
   * a static twin would be the third place this file's rules live.
   */
  readOnly?: boolean;
}

export function PriorityPicker({ task, onChange, restoreFocusTo, readOnly }: PriorityPickerProps) {
  const { t } = useT();
  const current = task.priority;
  const sentence =
    current === NO_PRIORITY
      ? t("tasks.priority.set")
      : t("tasks.priority.current", { value: t(`tasks.priority.${current}`) });

  // Nothing at all where there is nothing to report: a `⚐` that cannot be
  // clicked is an empty control rather than a fact about the Task.
  if (readOnly) {
    if (current === NO_PRIORITY) return null;
    return (
      <span className={`tm-priority-trigger is-${current} is-readonly`} title={sentence} aria-label={sentence}>
        <span aria-hidden="true">{GLYPH[current]}</span>
      </span>
    );
  }

  return (
    <Popover
      // §19.11: bottom-end, because the flag sits at the trailing edge of the
      // property header and a start-aligned surface would hang off it.
      placement="bottom-end"
      ownerTaskId={task.id}
      restoreFocusTo={restoreFocusTo}
    >
      <PopoverTrigger
        className={`tm-priority-trigger is-${current}`}
        // §8.28: the accessible name carries the value, so a reader is not
        // told only that there is a button. "Set priority" when there is none,
        // because "Priority, none" describes a state the user did not choose.
        aria-label={
          current === NO_PRIORITY
            ? t("tasks.priority.set")
            : t("tasks.priority.current", { value: t(`tasks.priority.${current}`) })
        }
        // §8.27: the same sentence on hover, for the flag drawn without text.
        title={
          current === NO_PRIORITY
            ? t("tasks.priority.set")
            : t("tasks.priority.current", { value: t(`tasks.priority.${current}`) })
        }
      >
        <span aria-hidden="true">{GLYPH[current]}</span>
      </PopoverTrigger>

      <PopoverContent label={t("tasks.priority")} className="tm-priority-surface" role="listbox">
        <PriorityOptions current={current} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Separated so it can call `usePopoverSurface`, which only exists inside the
 * surface — and so the keyboard ring is written once, against the same
 * `PRIORITY_LEVELS` order the list is drawn from.
 */
function PriorityOptions({
  current,
  onChange,
}: {
  current: TaskPriority;
  onChange: (level: TaskPriority) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();
  // Where the arrow keys are, which starts at the selected level: §8.25 moves
  // through the options, and entering a single-select list anywhere other than
  // at the current value makes the first arrow press feel like it skipped one.
  const [active, setActive] = useState<TaskPriority>(current);

  function choose(level: TaskPriority) {
    // §8.10: closing first, so the surface is gone before the list underneath
    // re-orders itself around a Task that may have just left the query.
    close();
    onChange(level);
  }

  return (
    <div
      className="tm-priority-options"
      onKeyDown={(event) => {
        if (!isRovingKey(event.key)) return;
        const next = rovingNext(PRIORITY_LEVELS, active, event.key);
        if (!next) return;
        // §19.33: no trap, but an arrow inside a single-select list moves
        // within the list rather than scrolling the page behind it.
        event.preventDefault();
        setActive(next);
        event.currentTarget.querySelector<HTMLElement>(`[data-level="${next}"]`)?.focus();
      }}
    >
      {PRIORITY_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="option"
          data-level={level}
          aria-selected={level === current}
          // One tab stop for the whole list, entered at the current value —
          // the ARIA single-select pattern, and what makes Tab leave the list
          // rather than walk it (§8.25).
          tabIndex={level === active ? 0 : -1}
          className={`tm-priority-option is-${level}${level === current ? " is-selected" : ""}`}
          onFocus={() => setActive(level)}
          onClick={() => choose(level)}
        >
          <span className="tm-priority-glyph" aria-hidden="true">
            {GLYPH[level]}
          </span>
          {t(`tasks.priority.${level}`)}
        </button>
      ))}
    </div>
  );
}
