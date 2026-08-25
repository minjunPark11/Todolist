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
import type { CheckItem, List, Task, TaskContentMode } from "../../types";
import type { TaskDetailPresentation } from "../../domain/tasks/responsive";
import type { TaskChild } from "../../domain/tasks/children";
import { childProgress } from "../../domain/tasks/children";
import { isCompleted } from "../../domain/tasks/taskState";
import { checklistProgress, isChecklistMode } from "../../domain/tasks/checkItems";
import { ChecklistEditor } from "./ChecklistEditor";
import { useT } from "../../i18n";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { DeferredInput, DeferredTextarea } from "../kit";

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
  /** This Task's checklist (spec §11), already in display order. */
  checkItems: CheckItem[];
  onSetContentMode: (mode: TaskContentMode) => void;
  onAddCheckItem: (text: string) => void;
  onAddCheckItems: (texts: string[]) => void;
  onRenameCheckItem: (itemId: string, text: string) => void;
  onToggleCheckItem: (itemId: string) => void;
  onDeleteCheckItem: (itemId: string) => void;
  /** This Task's ancestors, root first — §12.7's way back up. */
  ancestors: Array<{ id: string; title: string }>;
  onOpenTask: (taskId: string) => void;
  /** False at the deepest allowed level (§12.49). */
  canAddSubtask: boolean;
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
  checkItems,
  onSetContentMode,
  onAddCheckItem,
  onAddCheckItems,
  onRenameCheckItem,
  onToggleCheckItem,
  onDeleteCheckItem,
  ancestors,
  onOpenTask,
  canAddSubtask,
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
   * `defaultPrevented` is the whole guard: the Command Menu, any popover above
   * this one, and now a text field with an uncommitted draft all call
   * `preventDefault()` on their own Escape, and React dispatches those at its
   * root before the event reaches this listener. So Escape peels one layer at
   * a time instead of collapsing the stack — the first abandons the edit, the
   * second closes the Drawer (spec §18.14).
   *
   * Closing cannot lose an edit either way: the fields are drafts now (§9),
   * and a draft flushes when its field unmounts.
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
  const checklist = isChecklistMode(task);
  const progressLines = checklistProgress(task.id, checkItems);

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

      {/* Parent navigation (§12.7, §12.35). A child Task opened on its own is
          a Task with no visible context — this is where it came from, and it
          is the way back up. Every ancestor is a link, not just the immediate
          parent: on level 5 the useful jump is usually the root.

          Absent for a root Task rather than drawn empty. */}
      {ancestors.length > 0 ? (
        <nav className="tm-drawer-breadcrumb" aria-label={t("tasks.parentTask")}>
          {ancestors.map((ancestor) => (
            <button key={ancestor.id} type="button" onClick={() => onOpenTask(ancestor.id)}>
              {ancestor.title}
            </button>
          ))}
        </nav>
      ) : null}

      {/* §9: a draft, not a live write. It used to call `onUpdate` on every
          keystroke, which made every character a store replacement and left
          Enter, Escape and an IME's composition with nothing to do. `required`
          because §9.21 refuses an empty Title — clearing it and leaving is
          someone changing their mind, not asking for a nameless Task.

          `resetKey` is the Task id: the same Drawer is reused across Tasks, so
          an unflushed edit has to land on the one it was typed into before the
          field shows the next. */}
      <DeferredInput
        className="tm-drawer-title"
        value={task.title}
        onCommit={(title) => onUpdate({ title })}
        resetKey={task.id}
        required
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

      {/* §11.4: the mode toggle is the Content header's, and it is the only
          way into a conversion — §11.20 is explicit that text which looks
          like a checklist is not read as one until the user asks.

          §11.5: this is not a view switch. Choosing the other mode MOVES the
          content, in one transaction, and one Undo takes it back (§11.14,
          §11.15) — which is why the toggle can be two plain buttons rather
          than a dialog asking permission first. */}
      <section className="tm-drawer-content">
        <header className="tm-drawer-content-head">
          <span>{t(checklist ? "tasks.checklist" : "tasks.notes")}</span>
          {checklist ? (
            <span className="tm-count">
              {progressLines.done}/{progressLines.total}
            </span>
          ) : null}
          <div className="tm-drawer-mode" role="group" aria-label={t("tasks.contentMode")}>
            <button
              type="button"
              aria-pressed={!checklist}
              onClick={() => onSetContentMode("description")}
            >
              {t("tasks.contentMode.description")}
            </button>
            <button
              type="button"
              aria-pressed={checklist}
              onClick={() => onSetContentMode("checklist")}
            >
              {t("tasks.contentMode.checklist")}
            </button>
          </div>
        </header>

        {checklist ? (
          <ChecklistEditor
            items={checkItems}
            onAdd={onAddCheckItem}
            onAddMany={onAddCheckItems}
            onRename={onRenameCheckItem}
            onToggle={onToggleCheckItem}
            onDelete={onDeleteCheckItem}
          />
        ) : (
          /* Not single-line: Enter here is a paragraph break (spec §10.4). */
          <DeferredTextarea
            value={task.description}
            rows={3}
            onCommit={(description) => onUpdate({ description })}
            resetKey={task.id}
            aria-label={t("tasks.notes")}
          />
        )}
      </section>

      {/* §12.7: below the content, and §12.8: no empty card when there is
          nothing — just the way to add one. */}
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
              <input
                type="checkbox"
                checked={child.done}
                onChange={() => onToggleSubtask(child.id)}
                aria-label={child.title}
              />
              {/* A child Task opens like any other Task — which is what makes
                  the breadcrumb above a round trip rather than a one-way exit.
                  A legacy Subtask is not a Task and has no Detail to open, so
                  it stays plain text until something promotes it. */}
              {child.kind === "task" ? (
                <button
                  type="button"
                  className={`tm-drawer-subtask-open${child.done ? " is-done" : ""}`}
                  onClick={() => onOpenTask(child.id)}
                >
                  {child.title}
                </button>
              ) : (
                <span className={child.done ? "is-done" : ""}>{child.title}</span>
              )}
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
            a target you can hit.

            At the deepest allowed level the form is absent, not disabled:
            §16.28 is explicit that a control must not appear and then refuse.
            The line says why, so "the button is gone" is not a mystery. */}
        {canAddSubtask ? (
          <form onSubmit={submitSubtask}>
            <input name="subtask" placeholder={t("tasks.addSubtask")} aria-label={t("tasks.addSubtask")} />
            <button type="submit">{t("common.add")}</button>
          </form>
        ) : (
          <p className="tm-drawer-depth-limit">{t("tasks.maxDepthReached")}</p>
        )}
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
