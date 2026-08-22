import type { List, Subtask, Task, TaskPriority } from "../types";
import { activeLists, listDisplayName } from "../domain/spaces/hierarchy";
import { listIdFor } from "../domain/spaces/membership";
import { childProgress, childrenOf } from "../domain/tasks/children";
import { useState } from "react";
import { todayValue } from "../utils/date";
import { getMatrixPosition, patchForQuadrant, type MatrixQuadrant } from "../utils/eisenhower";
import { dependentsOf, eligibleBlockers } from "../domain/tasks/dependencies";
import { useT } from "../i18n";
import { DeferredInput, DeferredTextarea, Popover } from "./kit";
import { ScheduleEditor } from "./schedule/ScheduleEditor";
import {
  formatScheduleTrigger,
  scheduleFromTask,
  type Schedule,
  type ScheduleIssue,
} from "../domain/schedule";
import { MotionPanelShell } from "./motion/MotionPanelShell";

interface TaskDetailProps {
  task: Task | null;
  tasks: Task[];
  lists: List[];
  /** The keyboard-reachable half of U9 — the tree's drop target is the other. */
  onMoveToList: (taskId: string, listId: string) => void;
  subtasks: Subtask[];
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onUpdateTaskSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
  onRequestDeleteTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onClose?: () => void;
}

// Highest first: the value most worth picking should not be last in the list.
const taskPriorities: TaskPriority[] = ["high", "medium", "low", "none"];
const matrixQuadrants: Array<{ key: MatrixQuadrant; labelKey: string; hintKey: string }> = [
  { key: "I", labelKey: "eis.qI", hintKey: "eis.qIHint" },
  { key: "II", labelKey: "eis.qII", hintKey: "eis.qIIHint" },
  { key: "III", labelKey: "eis.qIII", hintKey: "eis.qIIIHint" },
  { key: "IV", labelKey: "eis.qIV", hintKey: "eis.qIVHint" },
];

export function TaskDetail({
  task,
  tasks,
  lists,
  onMoveToList,
  onUpdateTask,
  onUpdateTaskSchedule,
  onRequestDeleteTask,
  onArchiveTask,
  onDuplicateTask,
  subtasks,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onClose,
}: TaskDetailProps) {
  const { t, lang } = useT();
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [childTitle, setChildTitle] = useState("");

  if (!task) {
    return (
      <MotionPanelShell className="detail-panel muted-panel">
        <h2>{t("taskDetail.title")}</h2>
        <p>{t("taskDetail.selectTaskHint")}</p>
      </MotionPanelShell>
    );
  }

  const children = childrenOf(task.id, tasks, subtasks);
  const progress = childProgress(children);

  const today = todayValue();
  const schedule = scheduleFromTask(task);
  const scheduleLabel = formatScheduleTrigger(schedule, today, locale);
  const selectedQuadrant = getMatrixPosition(task, today).quadrant;
  // The picker refuses anything that would close a loop, so the cycle rule is
  // enforced where the value is written rather than guarded at every read.
  const blockerOptions = eligibleBlockers(tasks, task.id);
  // Derived, never stored — one fact, one place (domain/tasks/dependencies).
  const blocking = dependentsOf(tasks, task.id);

  return (
    <MotionPanelShell className="detail-panel">
      <div className="detail-handle" />
      {onClose ? (
        <button type="button" className="detail-close-button" aria-label="Close task detail" onClick={onClose}>
          x
        </button>
      ) : null}
      <header className="detail-header">
        <DeferredInput
          className="detail-title-input"
          value={task.title}
          resetKey={task.id}
          aria-label={t("taskDetail.taskTitleAria")}
          onCommit={(title) => onUpdateTask(task.id, { title })}
        />
        <DeferredTextarea
          className="detail-description-input"
          placeholder={t("taskDetail.addDescription")}
          value={task.description}
          resetKey={task.id}
          aria-label={t("taskDetail.taskDescriptionAria")}
          onCommit={(description) => onUpdateTask(task.id, { description })}
        />
      </header>

      <section className="detail-section">
        <h3>{t("taskDetail.schedule")}</h3>
        <div className="detail-field-list">
          {/* The three date inputs that stood here — start, work day, deadline
              — were the last place those fields were edited separately. They
              are one schedule now (audit §6), so this is one control. The
              times, the reminder and the repeat followed it in — the repeat
              was three separate inputs here and is now one of six presets
              inside the editor — so this is the only way a task's schedule is
              edited by hand, and every write goes through
              `updateTaskSchedule`. */}
          <div className="detail-field-list-row">
            <span>{t("taskDetail.schedule")}</span>
            <button
              type="button"
              className={scheduleLabel ? "sched-trigger" : "sched-trigger is-empty"}
              aria-expanded={editingSchedule}
              onClick={() => setEditingSchedule((open) => !open)}
            >
              {scheduleLabel || t("schedule.trigger")}
            </button>
            <Popover open={editingSchedule} onClose={() => setEditingSchedule(false)}>
              <ScheduleEditor
                key={task.id}
                taskId={task.id}
                locale={locale}
                schedule={schedule}
                today={today}
                onCommit={onUpdateTaskSchedule}
                onClose={() => setEditingSchedule(false)}
              />
            </Popover>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <h3>{t("taskDetail.planning")}</h3>
        <div className="detail-field-list">
          {/* Priority was settable in four creation forms and nowhere after —
              the only way to change it was the quadrant below, which can only
              produce "high" or "medium" (patchForQuadrant), so a task saved as
              Low or None could never be seen or corrected again. The quadrant
              is derived from this field plus the due date, so the two controls
              cannot disagree: setting Low here immediately reads as Unsorted
              below. */}
          {/* Where the task LIVES. The panel had no such control at all, so a
              task could only ever be filed by dragging it. */}
          <label>
            <span>{t("taskDetail.list")}</span>
            <select
              value={listIdFor(task, lists)}
              onChange={(event) => onMoveToList(task.id, event.target.value)}
            >
              {/* A task with no Space has no List either; the placeholder keeps
                  the control from showing someone else's list as its value. */}
              {listIdFor(task, lists) ? null : <option value="">{t("taskDetail.noList")}</option>}
              {/* Flat: the Project level that used to group these is gone,
                  and a List is the top of the tree now. */}
              {lists
                .filter((list) => !list.archivedAt && !list.deletedAt)
                .map((list) => (
                  <option key={list.id} value={list.id}>
                    {listDisplayName(list, t("list.defaultName"))}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.priority")}</span>
            <select
              value={task.priority}
              onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as TaskPriority })}
            >
              {taskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`priority.${priority}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.quadrant")}</span>
            <select
              value={selectedQuadrant}
              onChange={(event) => {
                const quadrant = matrixQuadrants.find((item) => item.key === event.target.value);
                if (quadrant) {
                  onUpdateTask(task.id, patchForQuadrant(task, quadrant.key, today));
                }
              }}
            >
              {matrixQuadrants.map((quadrant) => (
                <option key={quadrant.key} value={quadrant.key}>
                  {t(quadrant.labelKey)} ({t(quadrant.hintKey)})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.blockedBy")}</span>
            <select
              value={task.blockedByTaskId}
              onChange={(event) => onUpdateTask(task.id, { blockedByTaskId: event.target.value })}
            >
              <option value="">{t("taskDetail.blockedByNone")}</option>
              {/* A blocker set earlier can fall out of the eligible list once
                  it is completed. Keeping it as an option means the select
                  still shows what it is waiting on instead of silently
                  reading "Nothing" while the field holds an id. */}
              {task.blockedByTaskId && !blockerOptions.some((item) => item.id === task.blockedByTaskId) ? (
                <option value={task.blockedByTaskId}>
                  {tasks.find((item) => item.id === task.blockedByTaskId)?.title ?? task.blockedByTaskId}
                </option>
              ) : null}
              {blockerOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </label>
          {task.blockedByTaskId ? <small className="detail-hint">{t("taskDetail.blockedByHint")}</small> : null}
          {blocking.length > 0 ? (
            <div className="detail-blocking">
              <span>{t("taskDetail.blocks")}</span>
              <ul>
                {blocking.map((dependent) => (
                  <li key={dependent.id}>{dependent.title}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
      {/* The four subtask props were declared here and never rendered, which
          is how the app came to have two subtask features and show neither in
          this panel. `childrenOf` answers with both kinds at once, so a legacy
          Subtask is visible again — and promotes to a Task the moment it is
          ticked (domain/tasks/children.ts). */}
      <section className="detail-section">
        <h3>
          {t("spaceHub.section.subtasks")}
          {progress.total > 0 ? (
            <span className="detail-subtask-progress">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </h3>
        {children.length > 0 ? (
          <ul className="detail-subtasks">
            {children.map((child) => (
              <li key={child.id}>
                <label>
                  <input type="checkbox" checked={child.done} onChange={() => onToggleSubtask(child.id)} />
                  <span className={child.done ? "is-done" : ""}>{child.title}</span>
                </label>
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => onDeleteSubtask(child.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="detail-subtask-add"
          onSubmit={(event) => {
            event.preventDefault();
            const title = childTitle.trim();
            if (!title) return;
            onAddSubtask(task.id, title);
            setChildTitle("");
          }}
        >
          <input
            value={childTitle}
            placeholder={t("spaceHub.action.addSubtask")}
            aria-label={t("spaceHub.action.addSubtask")}
            onChange={(event) => setChildTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
          <button type="submit">{t("common.add")}</button>
        </form>
      </section>
      <section className="detail-section">
        <h3>{t("taskDetail.notes")}</h3>
        <DeferredTextarea
          className="detail-notes"
          placeholder={t("taskDetail.addNotes")}
          value={task.notes}
          resetKey={task.id}
          onCommit={(notes) => onUpdateTask(task.id, { notes })}
        />
      </section>
      <section className="detail-section task-actions-section">
        <h3>{t("taskDetail.actions")}</h3>
        <div className="task-action-row">
          <button onClick={() => onUpdateTask(task.id, { dueDate: todayValue() })}>
            {t("today.moveToToday")}
          </button>
          <button onClick={() => onDuplicateTask(task.id)}>{t("common.duplicate")}</button>
          <button onClick={() => onArchiveTask(task.id)}>{t("common.archive")}</button>
          <button className="danger-button-inline" onClick={() => onRequestDeleteTask(task.id)}>
            {t("common.delete")}
          </button>
        </div>
      </section>
    </MotionPanelShell>
  );
}
