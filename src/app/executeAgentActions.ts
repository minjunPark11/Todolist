import type { AgentAction } from "../lib/ai/agent/actions";
import { validateAgentAction, type ToolExecutionResult } from "../lib/ai/tools/toolExecutor";
import type { Project, Task, TaskDraft } from "../types";

type AgentActionPlanner = {
  tasks: Task[];
  projects: Project[];
  createTask: (draft: TaskDraft) => string;
  addSubtask: (taskId: string, title: string) => void;
  updateTask: (taskId: string, patch: Partial<Task>) => void;
};

export function executeAgentActions(
  actions: AgentAction[],
  planner: AgentActionPlanner,
): ToolExecutionResult[] {
  return actions.map((action) => {
    try {
      const validation = validateAgentAction(action, {
        tasks: planner.tasks,
        projects: planner.projects,
      });
      if (validation.status === "invalid") {
        return {
          actionId: action.id,
          ok: false,
          message: validation.reason ?? "Action validation failed.",
        };
      }

      if (action.type === "create_task") {
        const taskId = planner.createTask({
          title: action.payload.title,
          dueDate: action.payload.dueDate,
          projectId: action.payload.projectId,
          priority: action.payload.priority,
          status: "todo",
        });
        return {
          actionId: action.id,
          ok: Boolean(taskId),
          message: taskId ? "Task created." : "Task creation failed.",
        };
      }

      if (action.type === "create_calendar_event") {
        const taskId = planner.createTask({
          title: action.payload.title,
          scheduledDate: action.payload.scheduledDate,
          startTime: action.payload.startTime,
          endTime: action.payload.endTime,
          status: "todo",
        });
        return {
          actionId: action.id,
          ok: Boolean(taskId),
          message: taskId ? "Calendar task created." : "Calendar task creation failed.",
        };
      }

      if (action.type === "split_task") {
        for (const subtask of action.payload.subtasks) {
          planner.addSubtask(action.payload.taskId, subtask);
        }
        return {
          actionId: action.id,
          ok: true,
          message: "Subtasks added.",
        };
      }

      if (action.type === "update_task_due_date") {
        planner.updateTask(action.payload.taskId, { dueDate: action.payload.dueDate });
        return {
          actionId: action.id,
          ok: true,
          message: "Due date updated.",
        };
      }

      planner.updateTask(action.payload.taskId, { priority: action.payload.priority });
      return {
        actionId: action.id,
        ok: true,
        message: "Priority updated.",
      };
    } catch (error) {
      return {
        actionId: action.id,
        ok: false,
        message: error instanceof Error ? error.message : "Action failed.",
      };
    }
  });
}
