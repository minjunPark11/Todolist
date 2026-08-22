// The Task Detail Drawer (TickTick plan Implementation Phase 5, §16.28, §4).
//
// Its openness is the URL's, not this component's: `?task=` is where the state
// lives (§5.15), so a reload reopens it and one Back closes it. Nothing here
// mirrors that into a field — the bug §5's whole chapter exists to prevent is
// two places both believing they know what is open.
//
// §16.28 hides Repeat and Reminder for the MVP, and is explicit that a control
// must not appear as a disabled placeholder before the model behind it exists.
// So they are absent, not greyed out.
import { useEffect, useRef } from "react";
import type { List, Task } from "../../types";
import type { TaskDetailPresentation } from "../../domain/tasks/responsive";
import type { TaskChild } from "../../domain/tasks/children";
import { childProgress } from "../../domain/tasks/children";
import { isCompleted } from "../../domain/tasks/taskState";
import { useT } from "../../i18n";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export interface TaskDrawerProps {
  task: Task;
  /**
   * Where this is drawn (§15.17) — and only that.
   *
   * The registry decides inline column, right overlay, right sheet or
   * full screen. It decides nothing about what is fetched or what a control
   * does, which is why the same Drawer serves all four.
   */
  presentation: TaskDetailPresentation;
  lists: List[];
  children: TaskChild[];
  onClose: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  /** Completion goes through the mutation path so it can be undone (§16.29). */
  onComplete: () => void;
  onMoveToList: (listId: string) => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (id: string) => void;
  onDeleteSubtask: (id: string) => void;
  onTrash: () => void;
  /** Audit D-23. Toggles, because a mark you cannot take back is a delete. */
  onToggleWontDo: () => void;
}

const PRIORITIES = ["none", "low", "medium", "high"] as const;

export function TaskDrawer({
  presentation,
  task,
  lists,
  children,
  onClose,
  onUpdate,
  onComplete,
  onMoveToList,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onTrash,
  onToggleWontDo,
}: TaskDrawerProps) {
  const { t } = useT();
  const root = useRef<HTMLElement>(null);

  /**
   * §15.20: focus does not wander out of a sheet that covers what is behind
   * it, and it goes back where it came from when the sheet closes.
   *
   * Only for the presentations that actually cover something. The wide-desktop
   * Drawer is a column beside the list — trapping focus there would stop the
   * user tabbing back to the rows it belongs to.
   */
  useFocusTrap(root, { enabled: presentation !== "inline-drawer" });

  /**
   * Escape closes it — in every presentation, including the inline column.
   *
   * It did not before, in any of them. Measured: with the Drawer open, Escape
   * left the surface, the `?task=` parameter and focus all exactly as they
   * were, which made the 25×22 close button the only way out. Every other
   * dismissable surface in the app already answers Escape, so this was the
   * odd one rather than a deliberate exception.
   *
   * `defaultPrevented` is the whole guard: the Command Menu and any popover
   * above this one call `preventDefault()` on their own Escape, and React
   * dispatches those at its root before the event reaches this listener. So
   * Escape peels one layer at a time instead of collapsing the stack.
   *
   * Closing cannot lose an edit — the title field commits on every keystroke
   * (`onUpdate` below), so there is no draft here to discard.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const progress = childProgress(children);

  function submitSubtask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("subtask") as HTMLInputElement | null;
    const title = field?.value.trim() ?? "";
    if (!title) return;
    onAddSubtask(title);
    if (field) field.value = "";
  }

  return (
    <aside ref={root} className={`tm-drawer is-${presentation}`} aria-label={t("tasks.drawerLabel")}>
      <header className="tm-drawer-head">
        {/* §4: completion is one control and it is the first one. ST-I5 lets a
            parent finish with subtasks still open — they are not a gate. */}
        <label className="tm-drawer-done">
          <input
            type="checkbox"
            checked={isCompleted(task)}
            onChange={onComplete}
          />
          <span>{t("tasks.markDone")}</span>
        </label>
        <button type="button" className="tm-drawer-close" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
      </header>

      <input
        className="tm-drawer-title"
        value={task.title}
        onChange={(event) => onUpdate({ title: event.target.value })}
        aria-label={t("tasks.titleLabel")}
      />

      <div className="tm-drawer-fields">
        <label className="tm-drawer-field">
          <span>{t("tasks.addDate")}</span>
          <input
            type="date"
            value={task.dueDate}
            onChange={(event) => onUpdate({ dueDate: event.target.value })}
          />
        </label>

        <label className="tm-drawer-field">
          <span>{t("tasks.priority")}</span>
          <select
            value={task.priority}
            onChange={(event) => onUpdate({ priority: event.target.value as Task["priority"] })}
          >
            {PRIORITIES.map((level) => (
              <option key={level} value={level}>
                {t(`tasks.priority.${level}`)}
              </option>
            ))}
          </select>
        </label>

        {/* Moving between Lists goes through the domain command, not a field
            write: the List decides the Project, and `patchForListMove` is
            where that rule lives. */}
        <label className="tm-drawer-field">
          <span>{t("tasks.addList")}</span>
          <select value={task.listId ?? ""} onChange={(event) => onMoveToList(event.target.value)}>
            {lists
              .filter((list) => !list.archivedAt && !list.deletedAt)
              .map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <label className="tm-drawer-field is-block">
        <span>{t("tasks.notes")}</span>
        <textarea
          value={task.description}
          rows={3}
          onChange={(event) => onUpdate({ description: event.target.value })}
        />
      </label>

      <section className="tm-drawer-subtasks">
        <h3>
          {t("tasks.subtasks")}
          {progress.total > 0 ? (
            <span className="tm-count">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </h3>

        <ul>
          {children.map((child) => (
            <li key={child.id}>
              <label>
                <input type="checkbox" checked={child.done} onChange={() => onToggleSubtask(child.id)} />
                <span className={child.done ? "is-done" : ""}>{child.title}</span>
              </label>
              <button
                type="button"
                onClick={() => onDeleteSubtask(child.id)}
                aria-label={t("common.delete")}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {/* Enter submits, and the button is not decoration: a form whose only
            commit is a keypress has no affordance on touch, where §15.40 wants
            a target you can hit. */}
        <form onSubmit={submitSubtask}>
          <input name="subtask" placeholder={t("tasks.addSubtask")} aria-label={t("tasks.addSubtask")} />
          <button type="submit">{t("common.add")}</button>
        </form>
      </section>

      <div className="tm-drawer-terminal">
        {/* D-23. Beside Trash rather than beside Done: both are ways of
            finishing with a task you are not going to do, and the difference
            is whether you want to find it again. */}
        <button type="button" className="tm-drawer-wontdo" onClick={onToggleWontDo}>
          {t(task.wontDoAt ? "tasks.unmarkWontDo" : "tasks.markWontDo")}
        </button>

        {/* §16.28's Trash action. Soft delete — §12.13 is the screen it moves
            to, and §13.6 is where getting it back lives. */}
        <button type="button" className="tm-drawer-trash" onClick={onTrash}>
          {t("tasks.moveToTrash")}
        </button>
      </div>
    </aside>
  );
}
