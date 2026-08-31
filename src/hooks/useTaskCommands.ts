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
  pinTask,
  reopenTask,
  restoreTask,
  trashTask,
  unmarkWontDo,
  unpinTask,
} from "../domain/tasks/mutations";
import { canRunTaskAction, type TaskActionId } from "../domain/tasks/actions";
import { isCompleted } from "../domain/tasks/taskState";
import { copyText } from "../lib/copyText";

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
  /** §15.9. Makes the copy and hands back the way to take it back (§15.57). */
  onDuplicate: (taskId: string) => (() => void) | null;
  /** §25.8. Saves the Task's shape and answers with the template's id. */
  onSaveAsTemplate: (taskId: string) => string;
  onDeleteTemplate: (templateId: string) => void;
  /** §25.6's entry point, and only that — the engine owns everything after. */
  onStartFocus: (taskId: string) => void;
  /**
   * This Task's deep link, as the surface addresses it (§15.19).
   *
   * Handed in because the address is the SURFACE's, not this hook's: the Tasks
   * module writes `?task=` under a Scope, and a page that keeps the open Task
   * in memory has a different one to offer. Nothing here can work that out.
   */
  linkFor: (taskId: string) => string;
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
   * §15.19: the Task's deep link, on the clipboard.
   *
   * Not a mutation (§15.58) — nothing about the Task changes, so there is no
   * patch and nothing to undo, and the strip says so by drawing no Undo
   * button. §15.21 asks for both outcomes to be reported and §15.22 refuses to
   * let a refusal end in silence, which is what the URL in the failure notice
   * is for: it can still be selected and copied by hand.
   */
  function copyTaskLink(taskId: string) {
    const link = input.linkFor(taskId);
    void copyText(link).then((copied) =>
      setNotice(copied ? { labelKey: "tasks.linkCopied" } : { labelKey: "tasks.linkCopyFailed", text: link }),
    );
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
      case "pin":
        return mutate(task, pinTask(task, now));
      case "unpin":
        return mutate(task, unpinTask(task));
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
      case "saveAsTemplate": {
        // §25.8: the Task is not changed, so the way back is to delete the
        // template rather than to patch anything.
        const template = input.onSaveAsTemplate(task.id);
        if (template) {
          setNotice({ labelKey: "tasks.templateSaved", run: () => input.onDeleteTemplate(template) });
        }
        return;
      }
      case "duplicate": {
        // §15.54's double-trigger cannot happen from here: the menu closes on
        // the click that chose the row, and the copy is one synchronous store
        // write rather than a request that could still be in flight.
        const discard = input.onDuplicate(task.id);
        if (discard) setNotice({ labelKey: "tasks.undoDuplicated", run: discard });
        return;
      }
      case "copyLink":
        return copyTaskLink(task.id);
      case "activities":
        return setActivityTaskId(task.id);
      case "startFocus":
        return input.onStartFocus(task.id);
    }
  }

  return {
    notice,
    setNotice,
    mutate,
    toggleDone,
    runTaskAction,
    activityTaskId,
    closeActivity: () => setActivityTaskId(""),
  };
}
