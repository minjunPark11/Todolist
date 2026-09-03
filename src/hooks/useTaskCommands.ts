// What a Task can be told to do, and the strip that says what just happened.
//
// This was inline in `TasksModule` while that was the only screen with a Task
// on it. It is a hook because it is no longer: the Detail that the Today,
// Calendar, Matrix and Project pages open needs the same Complete, the same
// Priority, the same ⋯ menu and the same Undo, and a second copy of the switch
// below is how two surfaces come to disagree about what "Won't Do" writes
// (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5).
//
// It owns no collections. The caller hands in the Tasks and the store writes;
// what lives here is the ONE-AT-A-TIME state — the notice, and whose history is
// open — and the rule that every change arrives with the way back.
import { useState } from "react";
import type { Task } from "../types";
import type { TaskMutation } from "../domain/tasks/mutations";
import {
  completeTask,
  markWontDo,
  reopenTask,
  restoreTask,
  trashTask,
  unmarkWontDo,
} from "../domain/tasks/mutations";
import { canRunTaskAction, type TaskActionId } from "../domain/tasks/actions";
import { isCompleted } from "../domain/tasks/taskState";

/**
 * What just happened, and the way back from it if there is one.
 *
 * One at a time, and it is the last thing that happened (§9.40 keeps the stack
 * out of the MVP). It held only undos before; §15.21 needs the same strip to
 * say "Link copied", which has nothing to undo, and §15.22 needs it to show a
 * URL the reader can select when the clipboard refused. So `run` is optional
 * and `text` sits beside it — §15.69's point that a menu hands its result to
 * one feedback layer rather than growing its own.
 */
export interface TaskNotice {
  labelKey: string;
  run?: () => void;
  /** Shown verbatim, for a value that is not a translatable phrase. */
  text?: string;
}

export interface TaskCommandsInput {
  /**
   * Every Task, not the visible rows.
   *
   * `runTaskAction` re-reads its target from here (§15.67), so a Scope's
   * filtered list would make an action on a Task that has just left the view
   * silently do nothing.
   */
  tasks: Task[];
  /** True while a focus session is already running or paused (§15.5). */
  focusBusy: boolean;
  onMutate: (taskId: string, patch: Partial<Task>) => void;
  /** §25.6's entry point, and only that — the engine owns everything after. */
  onStartFocus: (taskId: string) => void;
  /**
   * Removes a trashed Task from the account, for good.
   *
   * The store's own guard refuses a Task nobody threw away
   * (TRASH_PERMANENT_DELETE_DESIGN.md §7.1), so this hook does not have to be
   * the only thing standing between a menu row and a hard delete.
   */
  onDeleteForever: (taskId: string) => void;
}

export interface TaskCommands {
  notice: TaskNotice | null;
  setNotice: (notice: TaskNotice | null) => void;
  /**
   * Apply a mutation, and offer the undo that goes with it.
   *
   * The undo comes from the mutation rather than from inverting the patch, so
   * pressing it restores what was there and not an approximation (§9.35).
   *
   * It does NOT close the Detail when the Task leaves the Scope. §1.28 decides
   * that, and the case that settles it is the ordinary one: ticking Done on
   * the Task you are reading, in Today. Taking the panel away there is taking
   * it away at the exact moment you might want to add a note about what you
   * just finished, and the way back would be a row that is by then filtered
   * out. §1.27 is untouched and still closes — a DELETED Task has no Detail to
   * show, which is a different thing from one that no longer matches a filter.
   */
  mutate: (target: Task, mutation: TaskMutation) => void;
  /** Completion from wherever a checkbox is drawn (audit L-13). */
  toggleDone: (task: Task) => void;
  /** Run one registry action (§15.64), whoever asked for it. */
  runTaskAction: (target: Task, id: TaskActionId) => void;
  /**
   * The Task the reader has asked to delete forever, or null (§3.3).
   *
   * The one action here that ASKS instead of doing. It is held in the hook
   * rather than in each shell because "a hard delete is asked twice" is a rule
   * about the command, not about a screen — two screens owning it separately
   * is how one of them ends up not asking.
   */
  pendingDeleteForever: Task | null;
  confirmDeleteForever: () => void;
  cancelDeleteForever: () => void;
  /** Whose history is open (§25.7), or "" for none. */
  activityTaskId: string;
  closeActivity: () => void;
}

export function useTaskCommands(input: TaskCommandsInput): TaskCommands {
  const [notice, setNotice] = useState<TaskNotice | null>(null);
  /**
   * Kept per Task rather than as a boolean: the Detail is reused across Tasks
   * (§1.26), so a flag would leave the panel open on the next one showing the
   * history of the one before it.
   */
  const [activityTaskId, setActivityTaskId] = useState("");
  const [pendingDeleteForever, setPendingDeleteForever] = useState<Task | null>(null);

  function mutate(target: Task, mutation: TaskMutation) {
    input.onMutate(target.id, mutation.patch);
    setNotice({
      labelKey: mutation.labelKey,
      run: () => input.onMutate(target.id, mutation.undo),
    });
  }

  /**
   * The Detail's own mutation rather than a second one, so the row and the
   * panel cannot come to disagree about what `done` writes (§12.12) — and the
   * undo arrives with it.
   */
  function toggleDone(task: Task) {
    mutate(task, isCompleted(task) ? reopenTask(task) : completeTask(task, new Date().toISOString()));
  }

  /**
   * The Task is read from the store again rather than taken from the menu that
   * was clicked. §15.67 is the reason: a menu is a picture of the state it
   * opened in, and a sync landing while it hangs there can trash the Task,
   * finish it, or start a focus session somewhere else. `canRunTaskAction`
   * asks the registry the same question a second time, and an action that is
   * no longer allowed is dropped rather than applied to a Task that no longer
   * looks like the one the reader chose it for.
   *
   * Every arm that changes the Task goes through `mutate`, so every one of
   * them arrives with the Undo §15.56 and §17 expect. Start Focus does not —
   * it starts a session rather than editing the Task, and §15.55's list of
   * optimistic, reversible actions does not include it.
   */
  function runTaskAction(target: Task, id: TaskActionId) {
    const task = input.tasks.find((row) => row.id === target.id);
    if (!task || !canRunTaskAction(id, task, { focusBusy: input.focusBusy })) return;
    const now = new Date().toISOString();

    switch (id) {
      case "complete":
        return mutate(task, completeTask(task, now));
      case "reopen":
        return mutate(task, reopenTask(task));
      case "wontDo":
        return mutate(task, markWontDo(task, now));
      case "restart":
        return mutate(task, unmarkWontDo(task));
      case "trash":
        return mutate(task, trashTask(task, now));
      case "restore":
        return mutate(task, restoreTask(task));
      case "activities":
        return setActivityTaskId(task.id);
      case "startFocus":
        return input.onStartFocus(task.id);
      // The only arm that does not act. §3.3: the one thing in this app with
      // no way back is asked about first, and `mutate` is no help — there is
      // no patch that puts a removed row back, which is exactly why the
      // question comes before the click and not after it in a toast.
      case "deleteForever":
        return setPendingDeleteForever(task);
    }
  }

  function confirmDeleteForever() {
    const target = pendingDeleteForever;
    setPendingDeleteForever(null);
    if (!target) return;
    // Asked a third time, in effect: §15.67's re-read applies here more than
    // anywhere, because the dialog can sit open while a sync restores the Task
    // somewhere else — and then this would be deleting something that is no
    // longer in the Trash at all.
    if (!canRunTaskAction("deleteForever", input.tasks.find((row) => row.id === target.id))) return;
    input.onDeleteForever(target.id);
  }

  return {
    notice,
    setNotice,
    mutate,
    toggleDone,
    runTaskAction,
    pendingDeleteForever,
    confirmDeleteForever,
    cancelDeleteForever: () => setPendingDeleteForever(null),
    activityTaskId,
    closeActivity: () => setActivityTaskId(""),
  };
}
