import type { TaskPriority } from "../../../types";

export type AgentActionRisk = "low" | "medium" | "high";

export type AgentAction =
  | {
      id: string;
      type: "create_task";
      label: string;
      risk: "low";
      payload: {
        title: string;
        dueDate?: string;
        projectId?: string;
        priority?: Exclude<TaskPriority, "none">;
        // Free-text details (e.g. the AI assistant's completion criteria and
        // context-card reference) stored on the task without a schema change.
        notes?: string;
        tags?: string[];
      };
    }
  | {
      id: string;
      type: "create_calendar_event";
      label: string;
      risk: "low" | "medium";
      payload: {
        title: string;
        scheduledDate: string;
        startTime?: string;
        endTime?: string;
        source: "agent";
      };
    }
  | {
      id: string;
      type: "split_task";
      label: string;
      risk: "medium";
      payload: {
        taskId: string;
        subtasks: string[];
      };
    }
  | {
      id: string;
      type: "update_task_due_date";
      label: string;
      risk: "medium";
      payload: {
        taskId: string;
        dueDate: string;
      };
    }
  | {
      id: string;
      type: "update_task_priority";
      label: string;
      risk: "medium";
      payload: {
        taskId: string;
        priority: Exclude<TaskPriority, "none">;
      };
    };

export function requiresConfirmation(action: AgentAction) {
  return action.type.startsWith("create_") || action.type.startsWith("update_") || action.type === "split_task";
}

export function getActionTypeLabel(action: AgentAction) {
  const labels: Record<AgentAction["type"], string> = {
    create_task: "Create task",
    create_calendar_event: "Create calendar event",
    split_task: "Split task",
    update_task_due_date: "Update due date",
    update_task_priority: "Update priority",
  };

  return labels[action.type];
}

export function getActionRiskLabel(risk: AgentActionRisk) {
  const labels: Record<AgentActionRisk, string> = {
    low: "Low risk",
    medium: "Needs review",
    high: "High risk",
  };

  return labels[risk];
}
