// The "완료" group, wherever a view draws one.
//
// This was `BoardColumnFinished`, private to `TaskBoard`, for as long as the
// Board's columns were the only place a tick had somewhere to land. That was
// the whole defect: §12.4 keeps finished work out of a Scope's rows, so in the
// list view a checked row simply left the screen — the only evidence that
// anything had happened was the undo strip at the bottom of the window, and a
// row that vanishes leaves the reader wondering whether it was the right one.
//
// The reference app answers this the same way in every view it has, which is
// the argument for one component rather than a second copy of the rules below:
// collapsed to a count, capped at `COMPLETED_PAGE`, then a link, and always
// BELOW the open work — a surface is read for what is left to do, and finished
// work that pushed that down would be answering the question with last week's
// answers.
//
// What genuinely differs between the callers is the shape of the row under it:
// the Board stacks cards, the list draws lines. That is `variant`, and it is
// the only thing this file lets a caller change.
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { Task } from "../../types";
import { COMPLETED_PAGE } from "../../domain/view/viewGroups";
import { useT } from "../../i18n";
import { TaskRowContent } from "./TaskRowContent";
import { MotionListRow } from "../motion/MotionListRow";

/** A card in a Board column, or a line in the list. */
export type FinishedGroupVariant = "card" | "row";

export function TaskFinishedGroup({
  tasks,
  openTaskId = "",
  onOpen,
  onToggleDone,
  variant = "card",
  defaultOpen = variant === "row",
  onContextMenu,
}: {
  /** Already newest-first: `groupTasks` orders the "완료" group, not this. */
  tasks: Task[];
  openTaskId?: string;
  onOpen: (taskId: string) => void;
  onToggleDone: (task: Task) => void;
  variant?: FinishedGroupVariant;
  /**
   * Whether the group starts open. The two views want opposite answers.
   *
   * A Board column is a narrow strip of a working surface, and finished work
   * open by default would push what is left to do below the fold — the one
   * screen where that is the whole question. The list's group is the last
   * thing on the page and pushes nothing down, so leaving it shut would hide
   * the very row the reader just ticked, which is what they came looking for.
   */
  defaultOpen?: boolean;
  /**
   * A finished row was right-clicked, where the view has a menu to answer with.
   *
   * The Board leaves this out; the list passes it, because unticking is not
   * the only thing anyone does to finished work — deleting it is the other,
   * and the row menu is where that lives.
   */
  onContextMenu?: (task: Task, x: number, y: number) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [shown, setShown] = useState(COMPLETED_PAGE);

  if (tasks.length === 0) return null;
  const visible = tasks.slice(0, shown);
  const hidden = tasks.length - visible.length;

  return (
    <section className={`tm-column-done${variant === "row" ? " is-rows" : ""}`}>
      {/* A button because it collapses, and the count is on it rather than
          beside the view's own title: the number up there is how much work is
          left, and adding finished work to it would make the two numbers on
          this screen mean different things. */}
      <button
        type="button"
        className="tm-column-done-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tm-column-done-caret" aria-hidden>
          {open ? "⌄" : "›"}
        </span>
        <span className="tm-column-done-name">{t("tasks.completed")}</span>
        <span className="tm-column-done-count">{tasks.length}</span>
      </button>

      {open ? (
        <ul className={variant === "card" ? "tm-column-cards" : "tm-list"} aria-label={t("tasks.completed")}>
          {/* The other end of the tick. A row leaving the open list arrives
              here in the same gesture, so it fades in where it landed rather
              than being there already when the eye catches up. */}
          <AnimatePresence initial={false}>
          {visible.map((task) => (
            <MotionListRow
              key={task.id}
              taskId={task.id}
              className={[
                "tm-task",
                variant === "card" ? "is-card" : "",
                "is-done",
                task.id === openTaskId ? "is-open" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onContextMenu={
                onContextMenu
                  ? (event) => {
                      event.preventDefault();
                      onContextMenu(task, event.clientX, event.clientY);
                    }
                  : undefined
              }
            >
              <TaskRowContent task={task} onOpen={onOpen} onToggleDone={onToggleDone} />
            </MotionListRow>
          ))}
          </AnimatePresence>
          {hidden > 0 ? (
            <li>
              <button
                type="button"
                className="tm-column-done-more"
                onClick={() => setShown((value) => value + COMPLETED_PAGE)}
              >
                {t("tasks.showMore")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
