// Everything the Task Detail can change about the Task it has open (§16.28).
//
// It lived inline in `TasksModuleProps` while the Module was the only surface
// that opened a Detail. It is a file of its own because it is no longer —
// `App.tsx` builds this same bundle for the pages the legacy panel still
// serves, and `TaskDetailPane` consumes it without knowing which of the two
// assembled it (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5).
//
// Callbacks take the Task's id rather than being bound to one, because the
// surface that builds this does not know which Task will be open when it is
// used — the Detail is reused across Tasks (§1.26).
import type { CheckItem, Task, TaskContentMode } from "../../types";
import type { TaskChild } from "../../domain/tasks/children";
import type { TaskActivityEntry } from "../../domain/tasks/activity";
import type { ReminderSpec, Schedule, ScheduleIssue } from "../../domain/schedule";

export interface TaskDetailBundle {
  childrenOf: (taskId: string) => TaskChild[];
  onUpdate: (taskId: string, patch: Partial<Task>) => void;
  onMoveToList: (taskId: string, listId: string) => void;
  /**
   * The whole schedule in one write (§5), returning whatever the domain
   * refused. The editor keeps the draft open on a refusal, so an empty array
   * is the only thing that means "written".
   */
  onCommitSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
  /** §13.39, by name — §13.41's inline create has no id yet. */
  onToggleTag: (taskId: string, name: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (id: string) => void;
  onDeleteSubtask: (id: string) => void;
  /** The Task's checklist and everything that edits it (spec §11). */
  checkItemsFor: (taskId: string) => CheckItem[];
  onSetContentMode: (taskId: string, mode: TaskContentMode) => void;
  onAddCheckItem: (taskId: string, text: string) => void;
  onAddCheckItems: (taskId: string, texts: string[]) => void;
  onRenameCheckItem: (itemId: string, text: string) => void;
  onToggleCheckItem: (itemId: string) => void;
  onDeleteCheckItem: (itemId: string) => void;
  /**
   * §25.7's history, already ordered — the same shape as `checkItemsFor`
   * above and for the same reason: the ordering is the domain's, and this
   * needs collections the Module does not hold (the focus sessions).
   */
  activityFor: (taskId: string) => TaskActivityEntry[];
  /** This Task's reminders (§6.3), for the Schedule popover. */
  remindersFor: (taskId: string) => ReminderSpec[];
}
