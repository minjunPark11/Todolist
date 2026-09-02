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
import { useEffect, useRef, useState } from "react";
import type {
  CheckItem,
  List,
  SidebarFolder,
  Tag,
  Task,
  TaskContentMode,
  TaskPriority,
  TaskTag,
} from "../../types";
import type { TaskDetailPresentation } from "../../domain/tasks/responsive";
import type { TaskChild } from "../../domain/tasks/children";
import type { TaskActionGroup, TaskActionId } from "../../domain/tasks/actions";
import { DETAIL_REVEAL_ACTIONS } from "../../domain/tasks/actions";
import { tagsForTask } from "../../domain/tags/tags";
import type { TaskActivityEntry } from "../../domain/tasks/activity";
import { childProgress } from "../../domain/tasks/children";
import { isCompleted, isPinned, isTrashed } from "../../domain/tasks/taskState";
import { checklistProgress, isChecklistMode } from "../../domain/tasks/checkItems";
import { ChecklistEditor } from "./ChecklistEditor";
import type { ReminderSpec, Schedule, ScheduleIssue } from "../../domain/schedule";
import { ListPicker } from "./ListPicker";
import { PriorityPicker } from "./PriorityPicker";
import { SchedulePicker } from "./SchedulePicker";
import { TagPicker } from "./TagPicker";
import { TaskActionsMenu } from "./TaskActionsMenu";
import { TaskActivityPanel } from "./TaskActivityPanel";
import { useT } from "../../i18n";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { TaskDetailWidthState } from "../../hooks/useTaskDetailWidth";
import { TASK_DETAIL_MAX_WIDTH, TASK_DETAIL_MIN_WIDTH } from "../../app/taskDetailWidth";
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
  /** The sidebar groups the List picker draws as headings (§13.9, §13.10). */
  folders: SidebarFolder[];
  /** Every Tag, and the relation that says which are on this Task (§13.32). */
  tags: Tag[];
  taskTags: TaskTag[];
  /** Adds, creates-then-adds, or unlinks — by name (§13.39, §13.41, §13.45). */
  onToggleTag: (name: string) => void;
  children: TaskChild[];
  onClose: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  /** Completion goes through the mutation path so it can be undone (§16.29). */
  onComplete: () => void;
  onMoveToList: (listId: string) => void;
  /**
   * §8.31's command rather than a field write, which is what gives the change
   * an Undo (§8.36). A no-op re-select never reaches here — `priorityChange`
   * filters it above (§8.8).
   */
  onSetPriority: (level: TaskPriority) => void;
  /** Today as `YYYY-MM-DD`, for the schedule trigger's wording. */
  today: string;
  /** Returns whatever was wrong; empty means it was written (§5.51). */
  onCommitSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (id: string) => void;
  onDeleteSubtask: (id: string) => void;
  /**
   * What this Task can be told to do (§15.3), already filtered for its state.
   *
   * The Drawer is handed the list rather than deciding it: §15.63 gives that
   * decision to `domain/tasks/actions`, so the ⋯ here and a right-click on the
   * row cannot come to disagree about what a Won't Do Task may do.
   */
  actions: TaskActionGroup[];
  /** Runs one, after the Module has re-checked it is still allowed (§15.66). */
  onRunAction: (id: TaskActionId) => void;
  /** This Task's reminders (§6.3), for the Schedule popover's panel. */
  reminders: ReminderSpec[];
  /** §25.7's history, while it is open; null when it is not. */
  activity: TaskActivityEntry[] | null;
  onCloseActivity: () => void;
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
  /**
   * §1.12-§1.14, owned by the Module because the reserved empty column needs
   * the same width — see the `--tm-detail-w` comment there.
   */
  resize: TaskDetailWidthState;
  /**
   * What this Task may be told to wait on, already including whatever it is
   * waiting on now (`blockerChoices`).
   *
   * Handed in for the same reason `actions` and `ancestors` are: the rule
   * about which Tasks are eligible — no self, no cycle, nothing finished — is
   * `domain/tasks/dependencies`'s, and the Drawer would need every Task in
   * the account to apply it here.
   */
  blockerOptions: Array<{ id: string; title: string }>;
  /** The other direction, derived rather than stored (`dependentsOf`). */
  blocking: Array<{ id: string; title: string }>;
  /** False at the deepest allowed level (§12.49). */
  canAddSubtask: boolean;
}

export function TaskDrawer({
  presentation,
  task,
  lists,
  folders,
  tags,
  taskTags,
  onToggleTag,
  children,
  onClose,
  onUpdate,
  onComplete,
  onMoveToList,
  onSetPriority,
  today,
  onCommitSchedule,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  actions,
  onRunAction,
  reminders,
  activity,
  onCloseActivity,
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
  resize,
  blockerOptions,
  blocking,
}: TaskDrawerProps) {
  const { t } = useT();
  const root = useRef<HTMLElement>(null);
  /**
   * A Task in the Trash is frozen in what it IS, not in what it says
   * (TRASH_PERMANENT_DELETE_DESIGN.md §14, Q1).
   *
   * The reference app strips this Detail's footer to `Restore` and
   * `Delete forever` — it removes the List picker and the ⋯, which are
   * where the Task is and what to do to it, and leaves the title and body
   * area looking ordinary. That line is the rule: lifecycle is settled
   * while a Task is deleted, and the words are still the reader's.
   *
   * Completion is the one that was actually broken. Ticking it wrote
   * `completedAt` beside `deletedAt` — a pair `matchesScope` shows in no
   * Scope, since `completed` requires `!deletedAt` — so it went nowhere and
   * then handed back a DONE task on restore, which is not the task the
   * reader put in the bin.
   */
  const frozen = isTrashed(task);

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

  // Which task was turned INTO a checklist here, so the caret can land in the
  // row the first item goes in (§11.6). Held as an id rather than a flag
  // because the Drawer does not remount when the task changes (§1.26) — a
  // boolean would follow the reader to the next task they opened.
  const [convertedId, setConvertedId] = useState("");

  /**
   * Which of the four optional sections this Task has been asked to show (§2).
   *
   * A Task that has tags shows its tags; one that has none shows nothing until
   * the ⋯ opens the section. That is the rule the whole body follows now, and
   * it is why the Detail of an ordinary Task is a title and a body rather than
   * five labelled rows most Tasks leave empty.
   *
   * Held with the Task id for `convertedId`'s reason: the Drawer does not
   * remount on a Task switch (§1.26), so a bare set would follow the reader to
   * the next Task and open sections there that nobody asked for.
   */
  const [revealed, setRevealed] = useState<{ taskId: string; fields: TaskActionId[] }>({
    taskId: "",
    fields: [],
  });
  const isRevealed = (id: TaskActionId) =>
    revealed.taskId === task.id && revealed.fields.includes(id);

  function reveal(id: TaskActionId) {
    setRevealed((current) =>
      current.taskId === task.id
        ? { taskId: task.id, fields: current.fields.includes(id) ? current.fields : [...current.fields, id] }
        : { taskId: task.id, fields: [id] },
    );
  }

  /**
   * The caret goes where the section just opened.
   *
   * Without this the menu closes, a field appears somewhere below the fold and
   * the reader has to find it — which is the same complaint §11.6 made about
   * converting to a checklist and landing nowhere.
   */
  const revealCount = revealed.taskId === task.id ? revealed.fields.length : 0;
  useEffect(() => {
    if (revealCount === 0) return;
    const field = root.current?.querySelector<HTMLElement>("[data-reveal-focus='true']");
    field?.focus();
  }, [revealCount]);

  // What the body actually has to draw. Content, then whatever this Task uses.
  const held = tagsForTask(task.id, tags, taskTags);
  const showSubtasks = children.length > 0 || isRevealed("addSubtask");
  const showTags = held.length > 0 || isRevealed("addTag");
  const showDependency =
    Boolean(task.blockedByTaskId) || blocking.length > 0 || isRevealed("setBlocker");
  const showNote = Boolean(task.notes?.trim()) || isRevealed("addNote");

  function submitSubtask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("subtask") as HTMLInputElement | null;
    const title = field?.value.trim() ?? "";
    if (!title) return;
    onAddSubtask(title);
    if (field) field.value = "";
  }

  /**
   * §1.12: desktop only, and only where there is something to resize against.
   *
   * The other three presentations cover the list rather than sitting beside it
   * (§1.15–§1.16), so their width is the screen's and a handle would offer a
   * drag that could not change anything.
   */
  const resizable = presentation === "inline-drawer";

  return (
    <aside
      ref={root}
      className={`tm-drawer is-${presentation}${resize.isResizing ? " is-resizing" : ""}`}
      aria-label={t("tasks.drawerLabel")}
    >
      {/* §1.13: a 1px divider with an 8px hit area, which is why the visible
          line is a pseudo-element and this element is wider than it looks.

          A `separator` with `aria-orientation="vertical"` and a value, because
          §1.12's drag has to have a keyboard equivalent — the same shape the
          Context Sidebar's handle already uses. */}
      {resizable ? (
        <div
          className="tm-drawer-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("tasks.resizeDetail")}
          aria-valuenow={resize.width}
          aria-valuemin={TASK_DETAIL_MIN_WIDTH}
          aria-valuemax={TASK_DETAIL_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            resize.beginResize(event.clientX);
          }}
          onDoubleClick={resize.resetWidth}
          onKeyDown={(event) => {
            if (resize.resizeByKey(event.key, event.shiftKey)) event.preventDefault();
          }}
        />
      ) : null}

      {/* §1.7's Property Header, and it does not scroll away.
          `□ │ Apr 20, 9:30 PM - 10:30 PM │ ⚑` is the row the spec draws, so
          Complete, the schedule and Priority sit here together rather than as
          three stacked rows further down. Reminder and Repeat are in the
          schedule popover (§6.4), which is why they are not separate controls.

          Sticky rather than fixed: the pane is the scroll container's parent,
          so this stays put as the content moves under it without being taken
          out of the flow. */}
      <header className="tm-drawer-head">
        {/* §4: completion is one control and it is the first one. ST-I5 lets a
            parent finish with subtasks still open — they are not a gate. */}
        {/* Disabled rather than absent, which is the opposite of §15.5 and
            deliberately so: that rule is for an action with nothing to do
            here, and this is a FACT that cannot be changed. The reference
            draws a checkbox on this screen too (§1.4). */}
        <label className={`tm-drawer-done${frozen ? " is-frozen" : ""}`}>
          <input
            type="checkbox"
            checked={isCompleted(task)}
            disabled={frozen}
            onChange={onComplete}
          />
          <span>{t("tasks.markDone")}</span>
        </label>

        {/* The whole schedule, not a due date (§5, audit §6).
            `<input type="date">` could write one field, so a Task's start,
            its times, its reminder and its repeat were unreachable from here
            — and the legacy panel, which has had the full editor all along,
            disagreed with this one about what a schedule was. The editor is
            the same component; only the trigger and the surface are new. */}
        <SchedulePicker
          task={task}
          reminders={reminders}
          today={today}
          onCommit={onCommitSchedule}
          restoreFocusTo={() => root.current}
          readOnly={frozen}
        />

        {/* §8.2, §8.5: a flag that opens a popover, not a dropdown. The
            `<select>` this replaces could show no flag, could not be undone
            (§8.36) and wrote a record when the same level was chosen twice
            (§8.8) — the last two because it went through `onUpdate` rather
            than the command every other surface uses (§8.31).

            §19.32: the Drawer is the focus fallback. The Detail is reused
            across Tasks, so a Task switch can remove this trigger while its
            popover is open, and focus would otherwise land on the body. */}
        <PriorityPicker task={task} onChange={onSetPriority} restoreFocusTo={() => root.current} readOnly={frozen} />

        {/* §15.6, §15.8: the one canonical value, said out loud.
            Without it Pin would be a state with no visible effect anywhere in
            the Detail — the reader would have to open the menu again and read
            which way the label had flipped. A word rather than a glyph, for
            §15.44's reason. */}
        {isPinned(task) ? <span className="tm-drawer-pinned">{t("tasks.pinned")}</span> : null}

        {/* The ⋯ used to stand here. It is in the footer now, beside the List
            — which is where the reference app puts both
            (TICKTICK_DETAIL_ANATOMY_DESIGN.md §1): the header is Complete, the
            date and Priority, and nothing else. */}

        <button type="button" className="tm-drawer-close" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
      </header>

      {/* §1.17, §1.18: the pane does not scroll — this does. That is what lets
          the header above stay put (§1.7), and it is why the scroll bar runs
          beside the content rather than beside the whole panel. */}
      <div className="tm-drawer-scroll">

      {/* §25.7. At the top of the scroll area rather than appended below the
          subtasks: a history the reader has to scroll to find is a history
          that looks like it did not open. */}
      {activity ? (
        <TaskActivityPanel entries={activity} onClose={onCloseActivity} taskId={task.id} />
      ) : null}

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
      {/* §11.4 puts the content-mode control here — beside the title, not
          inside the body it changes:

              Task Title                      ☷

          It was two labelled buttons in the Content header, which said "메모"
          twice on one line and put the switch below the thing it switches.
          Nothing about the conversion moves with it: §11.14's transaction and
          §11.15's single undo are `onSetContentMode`'s, and this is a
          different way to call it. */}
      <div className="tm-drawer-title-row">
        <DeferredInput
          className="tm-drawer-title"
          value={task.title}
          onCommit={(title) => onUpdate({ title })}
          resetKey={task.id}
          required
          aria-label={t("tasks.titleLabel")}
        />
        {/* The count the content heading used to carry. It followed the
            heading out (§2) and landed here rather than being dropped: it is
            the one thing that heading said which the body does not say for
            itself. Not `0/0` — `progressOf` in the MCP projections refuses
            that number for the same reason, that it reads as "no progress"
            where the truth is "this task has no parts". */}
        {checklist && progressLines.total > 0 ? (
          <span className="tm-count">
            {progressLines.done}/{progressLines.total}
          </span>
        ) : null}
        {/* Not while it is deleted. This one rewrites the body's SHAPE —
            a note becomes a list of items and back — which is the same kind
            of change as the three above, and not the typo fix the title and
            the body are left unlocked for. */}
        {frozen ? null : (
          <ContentModeToggle
            checklist={checklist}
            onSet={(mode) => {
              setConvertedId(mode === "checklist" ? task.id : "");
              onSetContentMode(mode);
            }}
          />
        )}
      </div>

      {/* §1.6's Content Body, and only that: the title above, the text here.

          Three labelled property rows stood between them — List, Tags and
          Waiting on — and a heading stood over this one. All four are gone
          (TICKTICK_DETAIL_ANATOMY_DESIGN.md §2). The reference app's body is
          the description with nothing over it; List is in the footer; Tags is
          a section that appears when the Task has tags; and the heading was
          naming a field the placeholder already names. */}
      <section className="tm-drawer-content">
        {checklist ? (
          <ChecklistEditor
            /* §1.26: the Drawer no longer remounts on a Task switch, so the
               component holding a per-Task draft has to reset itself. */
            key={task.id}
            items={checkItems}
            onAdd={onAddCheckItem}
            onAddMany={onAddCheckItems}
            onRename={onRenameCheckItem}
            onToggle={onToggleCheckItem}
            onDelete={onDeleteCheckItem}
            /* Only where the conversion left nothing to read. A checklist the
               description filled has its result on screen, and taking the
               caret to the empty row under it would be an answer to a
               question nobody asked. */
            focusDraft={convertedId === task.id && checkItems.length === 0}
          />
        ) : (
          /* Not single-line: Enter here is a paragraph break (spec §10.4). */
          <DeferredTextarea
            value={task.description}
            rows={3}
            placeholder={t("taskDetail.addDescription")}
            onCommit={(description) => onUpdate({ description })}
            resetKey={task.id}
            aria-label={t("tasks.description")}
          />
        )}
      </section>

      {/* §12.7: below the content, and §12.8: no empty card when there is
          nothing — now taken literally. The section used to draw its heading,
          an empty list and an add form for every Task, which is a card with
          nothing in it on most of them. It appears when the Task HAS children,
          or when the ⋯ asked for it (§2). */}
      {showSubtasks ? (
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
              <input
                name="subtask"
                placeholder={t("tasks.addSubtask")}
                aria-label={t("tasks.addSubtask")}
                data-reveal-focus={isRevealed("addSubtask") && children.length === 0 ? "true" : undefined}
              />
              <button type="submit">{t("common.add")}</button>
            </form>
          ) : (
            <p className="tm-drawer-depth-limit">{t("tasks.maxDepthReached")}</p>
          )}
        </section>
      ) : null}

      {/* §13.36's Tags, as the section the reference app draws — chips and a
          `+`, with no label over them, and nothing at all on a Task with no
          tags (its `.detail-tag-view` measures 0 there too;
          TICKTICK_COMPONENT_07_TASK_DETAIL_PANEL.md §3). */}
      {showTags ? (
        <section className="tm-drawer-tags">
          <TagPicker
            task={task}
            tags={tags}
            taskTags={taskTags}
            onToggle={onToggleTag}
            restoreFocusTo={() => root.current}
          />
        </section>
      ) : null}

      {/* What this Task is waiting on, and what waits on it.

          Ours, not the reference's — it has no dependencies — so the shape is
          borrowed from the sections around it rather than observed: present
          when the field holds something, absent otherwise, opened from the ⋯.
          A `<select>` rather than a picker, because a dependency picker has no
          spec behind it the way List (§13.9) and Tags (§13.36) do. */}
      {showDependency ? (
        <section className="tm-drawer-dependency">
          {/* The picker is drawn for a Task that IS waiting on something, or
              that has just been asked to. A Task that only has others waiting
              on IT gets the list below and no empty select above it — the
              reverse direction is derived and asks nothing of this reader. */}
          {task.blockedByTaskId || isRevealed("setBlocker") ? (
            <>
          <h3>{t("taskDetail.blockedBy")}</h3>
          <select
            value={task.blockedByTaskId}
            aria-label={t("taskDetail.blockedBy")}
            data-reveal-focus={isRevealed("setBlocker") && !task.blockedByTaskId ? "true" : undefined}
            onChange={(event) => onUpdate({ blockedByTaskId: event.target.value })}
          >
            <option value="">{t("taskDetail.blockedByNone")}</option>
            {blockerOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>

          {/* Only when there is one. An always-drawn hint under an empty select
              would explain a rule the reader has not invoked. */}
          {task.blockedByTaskId ? (
            <p className="tm-drawer-field-note">{t("taskDetail.blockedByHint")}</p>
          ) : null}
            </>
          ) : null}

          {/* The reverse direction, read-only because it is DERIVED —
              `dependentsOf` computes it from the other Tasks' own fields, so
              there is nothing here that could be written back. Each is a link
              for the same reason the breadcrumb's ancestors are: the useful
              next move from "three things are waiting on this" is opening one
              of them. */}
          {blocking.length > 0 ? (
            <>
              <h3>{t("taskDetail.blocks")}</h3>
              <ul>
                {blocking.map((dependent) => (
                  <li key={dependent.id}>
                    <button type="button" onClick={() => onOpenTask(dependent.id)}>
                      {dependent.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {/* `notes`, which is a SECOND field and not the body above (§3).

          Drawn when it holds something, or when the ⋯ opened it. It was an
          always-present box under the subtasks, which put an empty textarea on
          every Task in the account for the sake of the few that use it — the
          same charge §2 lays against the property rows. */}
      {showNote ? (
        <section className="tm-drawer-notes">
          <h3>{t("taskDetail.notes")}</h3>
          <DeferredTextarea
            value={task.notes}
            rows={2}
            placeholder={t("taskDetail.addNotes")}
            onCommit={(notes) => onUpdate({ notes })}
            resetKey={task.id}
            aria-label={t("taskDetail.notes")}
            data-reveal-focus={isRevealed("addNote") && !task.notes?.trim() ? "true" : undefined}
          />
        </section>
      ) : null}

      </div>

      {/* §1.6's fourth region, which this Detail did not have: the List on the
          left and the ⋯ on the right, 48px, outside the scroll
          (TICKTICK_COMPONENT_07_TASK_DETAIL_PANEL.md §3.1 measured exactly
          that). The List was a labelled property row and the ⋯ was in the
          header; both cost the body a line it no longer spends. */}
      <footer className="tm-drawer-foot">
        {isTrashed(task) ? (
          /* A thrown-away Task's Detail is a two-answer screen
             (TRASH_PERMANENT_DELETE_DESIGN.md §3.2, from §1.4's screenshot):
             get it back, or stop keeping it. The List picker goes because
             moving a Task you have thrown away is not a question to answer
             before deciding whether to keep it at all, and the ⋯ goes because
             the registry leaves a trashed Task four items — two of which are
             these — and a menu hiding two rows is a menu in the way. */
          <TrashedFooter onRunAction={onRunAction} />
        ) : (
          <>
        <ListPicker
          task={task}
          lists={lists}
          folders={folders}
          onMove={onMoveToList}
          restoreFocusTo={() => root.current}
        />

        {/* §15.2's entry point. Everything §15.3 calls secondary or structural
            lives behind it, and since §2 that includes the four that open a
            section of this Detail — Add subtask, Tags, Waiting on, Note.

            §15.62: opening it selects nothing. The Detail is already this
            Task's, which is why the menu needs no target of its own. */}
        <TaskActionsMenu
          taskId={task.id}
          title={task.title}
          groups={actions}
          onRun={(id) => {
            // The four that open rather than change (§2). They are the
            // Detail's own state, so they stop here rather than travelling to
            // the command layer, which has no section to open.
            if (DETAIL_REVEAL_ACTIONS.includes(id)) {
              reveal(id);
              return;
            }
            onRunAction(id);
          }}
          restoreFocusTo={() => root.current}
        />
          </>
        )}
      </footer>
    </aside>
  );
}

/**
 * `되살리기` and `영구 삭제`, and nothing else (§3.2).
 *
 * Both go through `onRunAction` rather than doing anything themselves, so they
 * are the same two commands the ⋯ was offering a moment ago — including the
 * second ask in front of the delete, which lives in `useTaskCommands` and
 * would be missing from a button that called a store function directly.
 *
 * Restore carries its label and Delete forever does not, which is §1.4's
 * arrangement and also the safer one: the destructive half is the one you have
 * to aim at, and it opens a dialog rather than acting.
 */
function TrashedFooter({ onRunAction }: { onRunAction: (id: TaskActionId) => void }) {
  const { t } = useT();
  return (
    <>
      <button
        type="button"
        className="tm-drawer-restore"
        onClick={() => onRunAction("restore")}
      >
        <RestoreIcon />
        {t("tasks.menu.restore")}
      </button>
      <button
        type="button"
        className="tm-drawer-delete-forever"
        aria-label={t("tasks.menu.deleteForever")}
        title={t("tasks.menu.deleteForever")}
        onClick={() => onRunAction("deleteForever")}
      >
        <TrashIcon />
      </button>
    </>
  );
}

/* Line art on the same 24-viewBox grid at stroke 1.9 as the rest of the app's
   icons, for the reason `components/schedule/icons.tsx` gives at length: an
   emoji is the platform's drawing in the font's colour at the type scale's
   size, and none of those three is one this app chose. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M4.5 6.5h15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.5 6.5V4.8h5v1.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M6.5 6.5l1 12.2h9l1-12.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M10.3 10v5.5M13.7 10v5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/** The same can, with the arrow coming back out of it. */
function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M4.5 6.5h15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.5 6.5l1 12.2h9l1-12.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M12 15.5V9.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.6 12.2L12 9.8l2.4 2.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The content-mode control (§11.4), as one button rather than two.
 *
 * Two states, so a menu would charge a click and buy nothing — and the
 * conversion behind it is undoable in one step (§11.15), which is what makes
 * an immediate toggle safe rather than presumptuous.
 *
 * The icon draws the PRESENT and the label says what pressing does. An icon is
 * looked at rather than read, so it has to agree with what is on screen right
 * now; the label is read, so it has to say what happens next. `aria-pressed`
 * carries the same state to anyone who cannot see the glyph.
 */
function ContentModeToggle({
  checklist,
  onSet,
}: {
  checklist: boolean;
  onSet: (mode: TaskContentMode) => void;
}) {
  const { t } = useT();
  const label = t(checklist ? "tasks.contentMode.toNotes" : "tasks.contentMode.toChecklist");
  return (
    <button
      type="button"
      className="tm-drawer-content-toggle"
      aria-label={label}
      title={label}
      aria-pressed={checklist}
      onClick={() => onSet(checklist ? "description" : "checklist")}
    >
      {checklist ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 7.5l2 2 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17l2 2 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12.5 8h7.5M12.5 17.5h7.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M5 4.5h9L19 9v10.5H5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          <path d="M8.5 12.5h7M8.5 16h4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
