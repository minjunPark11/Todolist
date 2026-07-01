import type { Project, Task } from "../../../types";
import type { AgentAction } from "../agent/actions";

export type ToolValidationStatus = "valid" | "invalid";

export type ToolValidationResult = {
  actionId: string;
  status: ToolValidationStatus;
  reason?: string;
};

export type ToolExecutionResult = {
  actionId: string;
  ok: boolean;
  message: string;
};

export type ToolValidationContext = {
  tasks: Task[];
  projects: Project[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isValidTime(value?: string) {
  if (!value) return true;
  if (!TIME_PATTERN.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function invalid(action: AgentAction, reason: string): ToolValidationResult {
  return {
    actionId: action.id,
    status: "invalid",
    reason,
  };
}

function valid(action: AgentAction): ToolValidationResult {
  return {
    actionId: action.id,
    status: "valid",
  };
}

export function validateAgentAction(
  action: AgentAction,
  context: ToolValidationContext,
): ToolValidationResult {
  if (action.type === "create_task") {
    if (!action.payload.title.trim()) return invalid(action, "Task title is required.");
    if (action.payload.dueDate && !isValidDate(action.payload.dueDate)) {
      return invalid(action, "Due date must use YYYY-MM-DD.");
    }
    if (action.payload.projectId && !context.projects.some((project) => project.id === action.payload.projectId)) {
      return invalid(action, "Project does not exist in the current user's data.");
    }
    return valid(action);
  }

  if (action.type === "create_calendar_event") {
    if (!action.payload.title.trim()) return invalid(action, "Event title is required.");
    if (!isValidDate(action.payload.scheduledDate)) {
      return invalid(action, "Scheduled date must use YYYY-MM-DD.");
    }
    if (!isValidTime(action.payload.startTime) || !isValidTime(action.payload.endTime)) {
      return invalid(action, "Event time must use HH:mm.");
    }
    if (action.payload.startTime && action.payload.endTime && action.payload.startTime >= action.payload.endTime) {
      return invalid(action, "Event end time must be after start time.");
    }
    return valid(action);
  }

  if (action.type === "split_task") {
    if (!context.tasks.some((task) => task.id === action.payload.taskId)) {
      return invalid(action, "Task does not exist in the current user's data.");
    }
    if (action.payload.subtasks.length === 0) {
      return invalid(action, "At least one subtask is required.");
    }
    if (action.payload.subtasks.some((subtask) => !subtask.trim())) {
      return invalid(action, "Subtask titles cannot be empty.");
    }
    return valid(action);
  }

  if (action.type === "update_task_due_date") {
    if (!context.tasks.some((task) => task.id === action.payload.taskId)) {
      return invalid(action, "Task does not exist in the current user's data.");
    }
    if (!isValidDate(action.payload.dueDate)) {
      return invalid(action, "Due date must use YYYY-MM-DD.");
    }
    return valid(action);
  }

  if (!context.tasks.some((task) => task.id === action.payload.taskId)) {
    return invalid(action, "Task does not exist in the current user's data.");
  }

  return valid(action);
}

export function validateAgentActions(
  actions: AgentAction[],
  context: ToolValidationContext,
): ToolValidationResult[] {
  return actions.map((action) => validateAgentAction(action, context));
}
