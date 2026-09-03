// The Task Detail, with its wiring — everything between "here is a Task" and
// the Drawer's thirty-odd props.
//
// The Drawer is deliberately given answers rather than collections (§15.63):
// what it may be told to do, where it came from, what it is waiting on. Those
// answers were worked out inline in `TasksModule`, which is why the Today,
// Calendar, Matrix and Project pages could not open the same panel — they have
// every collection the derivations need and none of the derivations.
//
// So this file is the derivations, and nothing else. It holds no state, makes
// no store write of its own, and decides nothing about layout: `presentation`
// and `resize` arrive from the surface, because where a Detail is drawn is the
// surface's question (§15.17) and what a Task IS is not
// (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5).
import type { List, SidebarFolder, Tag, Task, TaskTag } from "../../types";
import type { TaskDetailPresentation } from "../../domain/tasks/responsive";
import type { Rect } from "../../domain/floating";
import type { TaskDetailWidthState } from "../../hooks/useTaskDetailWidth";
import type { TaskCommands } from "../../hooks/useTaskCommands";
import type { TaskActionId } from "../../domain/tasks/actions";
import { taskActions } from "../../domain/tasks/actions";
import { ancestorsOf, canAddChild } from "../../domain/tasks/hierarchy";
import { blockerChoices, dependentsOf } from "../../domain/tasks/dependencies";
import { priorityChange } from "../../domain/tasks/priority";
import type { TaskDetailBundle } from "./taskDetailBundle";
import { TaskDrawer } from "./TaskDrawer";

/**
 * The actions the Detail draws as controls of its own (§15.3).
 *
 * Only completion: the schedule, Priority, the List and Tags are property rows
 * rather than registry actions, so there is nothing there for the menu to
 * repeat.
 */
const DETAIL_PROMOTED_ACTIONS: TaskActionId[] = ["complete", "reopen"];

export interface TaskDetailPaneProps {
  task: Task;
  /** Where this is drawn (§15.17) — the surface's decision, not this one's. */
  presentation: TaskDetailPresentation;
  /** And, for the popup, what it opens beside (§3.4). Rides through untouched. */
  anchor?: Rect | null;
  /** §1.12–§1.14. The surface owns the width; the handle's behaviour rides in. */
  resize: TaskDetailWidthState;
  /** Today as `YYYY-MM-DD`, for the schedule trigger's wording. */
  today: string;
  /**
   * Every Task in the account, not the visible rows.
   *
   * All three derivations below read it, and all three want the same thing
   * from it: an ancestor, a blocker or a dependent that a filter has hidden is
   * still an ancestor, a blocker or a dependent.
   */
  tasks: Task[];
  lists: List[];
  /** The sidebar groups the List picker draws as headings (§13.9, §13.10). */
  folders: SidebarFolder[];
  tags: Tag[];
  taskTags: TaskTag[];
  /** Everything the Detail can CHANGE about the Task it has open (§16.28). */
  bundle: TaskDetailBundle;
  /** Everything the Task can be TOLD to do, and the notice that follows. */
  commands: TaskCommands;
  /** True while a focus session is already running or paused (§15.5). */
  focusBusy: boolean;
  onClose: () => void;
  /** How this surface opens another Task — a breadcrumb, a child, a dependent. */
  onOpenTask: (taskId: string) => void;
}

export function TaskDetailPane({
  task,
  presentation,
  anchor,
  resize,
  today,
  tasks,
  lists,
  folders,
  tags,
  taskTags,
  bundle,
  commands,
  focusBusy,
  onClose,
  onOpenTask,
}: TaskDetailPaneProps) {
  return (
    <TaskDrawer
      /* No `key` on the Drawer — §1.26 forbids exactly what one produces.
         Keying the pane by Task id remounts the whole panel on every switch,
         which is "Pane close/reopen" from that section's list of things to
         avoid: the entrance animation replays, the scroll position resets, and
         a fast walk down a list flickers.

         Nothing is lost by dropping it. The text fields already take
         `resetKey={task.id}` (§9), the schedule editor is keyed inside
         `SchedulePicker`, and the one remaining piece of per-Task local state
         — the checklist's draft row — is keyed on its own component. Remount
         what holds the state, not the surface around it. */
      task={task}
      presentation={presentation}
      anchor={anchor}
      resize={resize}
      today={today}
      lists={lists}
      folders={folders}
      tags={tags}
      taskTags={taskTags}
      onToggleTag={(name) => bundle.onToggleTag(task.id, name)}
      children={bundle.childrenOf(task.id)}
      onClose={onClose}
      onUpdate={(patch) => bundle.onUpdate(task.id, patch)}
      onMoveToList={(listId) => bundle.onMoveToList(task.id, listId)}
      // §5.51: the editor keeps the draft open when the domain refuses it, so
      // the issues have to come back rather than being swallowed here.
      onCommitSchedule={bundle.onCommitSchedule}
      onAddSubtask={(title) => bundle.onAddSubtask(task.id, title)}
      onToggleSubtask={bundle.onToggleSubtask}
      onDeleteSubtask={bundle.onDeleteSubtask}
      checkItems={bundle.checkItemsFor(task.id)}
      reminders={bundle.remindersFor(task.id)}
      onSetContentMode={(mode) => bundle.onSetContentMode(task.id, mode)}
      onAddCheckItem={(text) => bundle.onAddCheckItem(task.id, text)}
      onAddCheckItems={(texts) => bundle.onAddCheckItems(task.id, texts)}
      onRenameCheckItem={bundle.onRenameCheckItem}
      onToggleCheckItem={bundle.onToggleCheckItem}
      onDeleteCheckItem={bundle.onDeleteCheckItem}
      // §12.7's way back up, computed against every Task.
      ancestors={ancestorsOf(task.id, tasks)}
      onOpenTask={onOpenTask}
      canAddSubtask={canAddChild(task.id, tasks)}
      // Both directions of the dependency row (§4).
      blockerOptions={blockerChoices(tasks, task)}
      blocking={dependentsOf(tasks, task.id).map((dependent) => ({
        id: dependent.id,
        title: dependent.title,
      }))}
      // §8.8's no-op is decided in the domain, so the Drawer never has to
      // compare the values itself. Through `mutate` like every other change,
      // which is what gives it the Undo §8.36 asks for.
      onSetPriority={(level) => {
        const change = priorityChange(task, level);
        if (change) commands.mutate(task, change);
      }}
      /* The row's checkbox, not a second one. §12.12's point is that the row
         and the panel must not come to disagree about what `done` writes, and
         two call sites spelling out the same ternary is how they would. */
      onComplete={() => commands.toggleDone(task)}
      /* §15.3: Complete is drawn in the header as a checkbox, so it is
         promoted out of the menu rather than repeated inside it. Reopen goes
         with it — it is the same checkbox, unticked. */
      /* `surface: "detail"` is what admits the four that OPEN a section of
         this panel (§2). A row's right-click menu asks the same registry and
         does not get them, because it has no Detail to open one in. */
      actions={taskActions({ task, promoted: DETAIL_PROMOTED_ACTIONS, focusBusy, surface: "detail" })}
      onRunAction={(id) => commands.runTaskAction(task, id)}
      activity={commands.activityTaskId === task.id ? bundle.activityFor(task.id) : null}
      onCloseActivity={commands.closeActivity}
    />
  );
}
