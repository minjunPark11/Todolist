// The box that finishes a task from the grid
// (CALENDAR_TASK_CHECKBOX_DESIGN.md §5, §6).
//
// It is a real `<input type="checkbox">` for the reason `TaskCheck.tsx` gives:
// Space toggles it, `:checked` describes it, the wrapping `<label>` targets
// it, and a screen reader calls it a checkbox — all of which would have to be
// rebuilt by hand behind a `<span role="checkbox">`. Putting one inside the
// block is why the block stopped being a `<button>` (§2.1).
//
// The label around it is the hit area. The box is 15px, which is not a finger;
// `align-self: stretch` in the stylesheet grows the label to the block's full
// height, the same trick `.tm-task-check` uses to reach a row's 40px.
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import type { CalendarItem } from "../../utils/calendarItems";
import { useT } from "../../i18n";

export type CalendarCheckSize = "block" | "chip" | "month";

interface CalendarItemCheckProps {
  item: CalendarItem;
  /** Absent while a surface is not wired for completion yet. */
  onToggleDone?: (taskId: string) => void;
  size: CalendarCheckSize;
}

/**
 * Whether this item is something that can be finished.
 *
 * Only a task. An external event belongs to a calendar we do not own, and a
 * focus block is a recording of time already spent — neither is work still to
 * do, so neither gets a box, and neither leaves a gap where one would be
 * (§5). Blocks are separate objects on a grid, not rows in a list, so nothing
 * needs to line up with anything.
 */
export function itemTakesCheck(item: CalendarItem): boolean {
  return item.layer === "task" && item.sourceType === "task" && !item.readOnly;
}

export function CalendarItemCheck({ item, onToggleDone, size }: CalendarItemCheckProps) {
  const { t } = useT();
  if (!onToggleDone || !itemTakesCheck(item)) return null;

  const done = Boolean(item.done);

  // §6: three gestures listen around this box. The column's drag-selection
  // already excludes inputs (`shouldStartTimeSelection`), but the block's own
  // `startMove` is bound to the block and would otherwise treat a tick as the
  // beginning of a drag — and the block's click would open the popover on top
  // of it. Both are stopped here rather than guarded there, so the block does
  // not have to know what it contains.
  const stopPointer = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();
  const stopClick = (event: ReactMouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <label
      className={`gcal-check is-${size}`}
      onPointerDown={stopPointer}
      onClick={stopClick}
    >
      <input
        type="checkbox"
        className="gcal-check-box"
        checked={done}
        /* Said in full: the box carries no visible text, and on a grid the
           title beside it belongs to the block, not to this control. */
        aria-label={t(done ? "calendar.uncheckAria" : "calendar.checkAria", { title: item.title })}
        onPointerDown={stopPointer}
        onClick={stopClick}
        onChange={() => onToggleDone(item.sourceId)}
      />
    </label>
  );
}
