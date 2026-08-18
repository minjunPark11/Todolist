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
import type { List, Task } from "../../types";
import type { TaskChild } from "../../domain/tasks/children";
import { childProgress } from "../../domain/tasks/children";
import { useT } from "../../i18n";

export interface TaskDrawerProps {
  task: Task;
  lists: List[];
  children: TaskChild[];
  onClose: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onMoveToList: (listId: string) => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (id: string) => void;
  onDeleteSubtask: (id: string) => void;
  onTrash: () => void;
}

const PRIORITIES = ["none", "low", "medium", "high"] as const;

export function TaskDrawer({
  task,
  lists,
  children,
  onClose,
  onUpdate,
  onMoveToList,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onTrash,
}: TaskDrawerProps) {
  const { t } = useT();
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
    <aside className="tm-drawer" aria-label={t("tasks.drawerLabel")}>
      <header className="tm-drawer-head">
        {/* §4: completion is one control and it is the first one. ST-I5 lets a
            parent finish with subtasks still open — they are not a gate. */}
        <label className="tm-drawer-done">
          <input
            type="checkbox"
            checked={task.status === "done"}
            onChange={() => onUpdate({ status: task.status === "done" ? "todo" : "done" })}
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
              .filter((list) => !list.archivedAt)
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

      {/* §16.28's Trash action. Soft delete — §12.13 is the screen it moves to,
          and §13.6 is where getting it back lives. */}
      <button type="button" className="tm-drawer-trash" onClick={onTrash}>
        {t("tasks.moveToTrash")}
      </button>
    </aside>
  );
}
