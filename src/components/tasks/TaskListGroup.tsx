// One date group of the list view, and the drop target it is.
//
// The Matrix's boxes and the Board's columns have divided their contents by
// date since their respective phase 2s; the list view showed one flat run of
// rows, so the screen that most people spend their day on was the one that
// could not tell late work from next week's. `groupTasks` already answered
// this — the same call, the same labels, the same reading order — and what was
// missing was somewhere to draw it.
//
// It is a drop target because the reference app's is: a task dragged out of
// "기한 초과" and let go under "오늘" is rescheduled. What that WRITES is not
// decided here, and cannot be — `moveToDateGroup` owns it, and the groups it
// refuses are the ones this component never lights up for (Gate 7's rule that
// a target which could only fail is not a target).
import { useState, type ReactNode } from "react";
import type { GroupId } from "../../domain/view/viewGroups";
import { useT } from "../../i18n";

export function TaskListGroup({
  id,
  count,
  showHeader,
  canAccept,
  isOver,
  onDragOver,
  onDrop,
  children,
}: {
  id: GroupId;
  count: number;
  /**
   * Whether the group announces itself.
   *
   * False when it is the only group there is, which covers two cases with one
   * rule. Grouping turned off leaves one group holding everything; and a Scope
   * that IS one bucket — Completed, whose every row is finished — divides into
   * exactly one too. Either way the heading would repeat what the screen above
   * it already says, and a line spent saying nothing is worse than no line.
   */
  showHeader: boolean;
  /**
   * Whether the row being carried could be let go here — asked NOW, not at the
   * last render.
   *
   * A function because of what it has to read. `dragstart` sets which row is
   * in the air through React state, and `dragover` can arrive before React
   * has re-rendered; a boolean prop computed in the previous render would then
   * say "nothing is being dragged", the handler would skip
   * `preventDefault()`, and the browser would refuse a drop that should have
   * been taken. `TaskBoard` keeps a ref beside its state for exactly this,
   * and this is the same fix from the other end. It answers false for the
   * groups `moveToDateGroup` refuses, so a group never lights up for a drop
   * it would discard.
   */
  canAccept: () => boolean;
  isOver: boolean;
  onDragOver: () => void;
  onDrop: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  // Open, unlike the Matrix's "unmatched" report and unlike "완료": these are
  // the work still to be done, and a day that starts collapsed is a day
  // nobody can read without opening four things first.
  const [open, setOpen] = useState(true);

  return (
    <section
      className={`tm-group is-${id}${isOver ? " is-over" : ""}`}
      onDragOver={(event) => {
        if (!canAccept()) return;
        // Without this the browser refuses the drop and the cursor says so.
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        if (!canAccept()) return;
        event.preventDefault();
        onDrop();
      }}
    >
      {showHeader ? (
        <button
          type="button"
          className="tm-group-head"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="tm-group-caret" aria-hidden>
            {open ? "⌄" : "›"}
          </span>
          {/* The Matrix's labels, not a second set of them. The two screens
              divide by the same rule, and calling the same bucket "기한 초과"
              here and something else there would make one rule read as two. */}
          <span className="tm-group-name">{t(`matrix.group.${id}`)}</span>
          <span className="tm-group-count">{count}</span>
        </button>
      ) : null}

      {open ? children : null}
    </section>
  );
}
