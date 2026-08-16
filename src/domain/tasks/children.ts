// What a Task's children are, when the app has spent two features answering
// that separately.
//
// `Subtask` is a checkbox: id, title, completed, and nothing else. A child
// `Task` is a Task — it has dates, a status, a priority, and so it can appear
// on the board, the calendar and the timeline. Both are called "subtask" in
// the UI, on two different screens, and the one you got depended on which
// panel you happened to be in.
//
// The Task is the right shape: everything a Subtask can express, a Task can,
// and a Subtask can never grow a deadline. So new children are Tasks, and this
// module is what lets the old records keep working meanwhile.
//
// Nothing is converted in bulk. A migration that rewrites every Subtask into a
// Task uploads every one of them, which is the write amplification this
// repository has removed twice (see domain/spaces/membership.ts). Legacy rows
// are read where they are, and promoted only when the user touches one.
import type { Subtask, Task, TaskDraft } from "../../types";

export type TaskChild =
  | { kind: "task"; id: string; title: string; done: boolean; task: Task }
  | { kind: "legacy"; id: string; title: string; done: boolean; subtask: Subtask };

/**
 * Children of one Task, child Tasks first.
 *
 * Order is deliberate rather than interleaved by time: the two kinds are not
 * peers for long — legacy rows are on their way out — and a list that reshuffles
 * as they are promoted would read as the app losing track of them.
 */
export function childrenOf(taskId: string, tasks: Task[], subtasks: Subtask[]): TaskChild[] {
  if (!taskId) return [];
  const children: TaskChild[] = [];
  for (const task of tasks) {
    if (task.parentTaskId !== taskId || task.deletedAt) continue;
    children.push({
      kind: "task",
      id: task.id,
      title: task.title,
      done: task.status === "done",
      task,
    });
  }
  for (const subtask of subtasks) {
    if (subtask.taskId !== taskId) continue;
    children.push({ kind: "legacy", id: subtask.id, title: subtask.title, done: subtask.completed, subtask });
  }
  return children;
}

export interface ChildProgress {
  done: number;
  total: number;
}

export function childProgress(children: TaskChild[]): ChildProgress {
  return { done: children.filter((child) => child.done).length, total: children.length };
}

/**
 * The Task a new child should be, inheriting only what keeps it in the same
 * place as its parent.
 *
 * Space membership travels (a subtask of a Research task is Research work) and
 * so do the grouping tags the Space detail relies on. Dates and priority do
 * NOT: a child is not due when its parent is, and inheriting a deadline would
 * put a date on the timeline that nobody chose.
 */
export function childDraft(parent: Task, title: string): TaskDraft {
  return {
    title: title.trim(),
    status: "todo",
    projectId: parent.projectId,
    parentTaskId: parent.id,
    listId: parent.listId,
    tags: parent.tags.filter((tag) => tag.startsWith("space:") || tag.startsWith("group:")),
  };
}

/**
 * A legacy Subtask, as the Task it should have been.
 *
 * Promotion happens on touch, not on load — completing or renaming one is the
 * moment its record has to be written anyway, so the conversion rides along
 * and costs no extra row.
 */
export function promoteDraft(parent: Task, subtask: Subtask): TaskDraft {
  return {
    ...childDraft(parent, subtask.title),
    status: subtask.completed ? "done" : "todo",
  };
}
