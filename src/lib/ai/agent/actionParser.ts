import type { TaskPriority } from "../../../types";
import type { AgentAction } from "./actions";

const ACTION_BLOCK_PATTERN = /```agent_actions\s*([\s\S]*?)```/i;
const supportedActionTypes = [
  "create_task",
  "create_calendar_event",
  "split_task",
  "update_task_due_date",
  "update_task_priority",
] as const;
const taskPriorities = ["low", "medium", "high"] as const;

type RawAction = {
  id?: unknown;
  type?: unknown;
  label?: unknown;
  risk?: unknown;
  payload?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isTaskPriority(value: unknown): value is Exclude<TaskPriority, "none"> {
  return typeof value === "string" && taskPriorities.includes(value as Exclude<TaskPriority, "none">);
}

function makeId(index: number, type: string) {
  return `action-${type}-${Date.now()}-${index}`;
}

function validateAction(raw: RawAction, index: number): AgentAction | null {
  if (!supportedActionTypes.includes(raw.type as (typeof supportedActionTypes)[number])) {
    return null;
  }

  if (!isRecord(raw.payload)) {
    return null;
  }

  const type = raw.type as AgentAction["type"];
  const id = optionalString(raw.id) ?? makeId(index, type);
  const label = optionalString(raw.label) ?? type.replace(/_/g, " ");

  if (type === "create_task") {
    const title = optionalString(raw.payload.title);
    if (!title) return null;

    const priority = isTaskPriority(raw.payload.priority) ? raw.payload.priority : undefined;
    return {
      id,
      type,
      label,
      risk: "low",
      payload: {
        title,
        dueDate: optionalString(raw.payload.dueDate),
        projectId: optionalString(raw.payload.projectId),
        priority,
      },
    };
  }

  if (type === "create_calendar_event") {
    const title = optionalString(raw.payload.title);
    const scheduledDate = optionalString(raw.payload.scheduledDate);
    if (!title || !scheduledDate) return null;

    return {
      id,
      type,
      label,
      risk: raw.risk === "medium" ? "medium" : "low",
      payload: {
        title,
        scheduledDate,
        startTime: optionalString(raw.payload.startTime),
        endTime: optionalString(raw.payload.endTime),
        source: "agent",
      },
    };
  }

  if (type === "split_task") {
    const taskId = optionalString(raw.payload.taskId);
    const subtasks = Array.isArray(raw.payload.subtasks)
      ? raw.payload.subtasks.map(optionalString).filter((item): item is string => Boolean(item)).slice(0, 12)
      : [];
    if (!taskId || subtasks.length === 0) return null;

    return {
      id,
      type,
      label,
      risk: "medium",
      payload: { taskId, subtasks },
    };
  }

  if (type === "update_task_due_date") {
    const taskId = optionalString(raw.payload.taskId);
    const dueDate = optionalString(raw.payload.dueDate);
    if (!taskId || !dueDate) return null;

    return {
      id,
      type,
      label,
      risk: "medium",
      payload: { taskId, dueDate },
    };
  }

  const taskId = optionalString(raw.payload.taskId);
  const priority = isTaskPriority(raw.payload.priority) ? raw.payload.priority : undefined;
  if (!taskId || !priority) return null;

  return {
    id,
    type,
    label,
    risk: "medium",
    payload: { taskId, priority },
  };
}

export function parseAgentActionBlock(content: string) {
  const match = content.match(ACTION_BLOCK_PATTERN);
  if (!match) {
    return { message: content.trim(), actions: [] as AgentAction[] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { message: content.replace(ACTION_BLOCK_PATTERN, "").trim(), actions: [] as AgentAction[] };
  }

  const rawActions = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.actions)
      ? parsed.actions
      : [];

  const actions = rawActions
    .map((raw, index) => (isRecord(raw) ? validateAction(raw as RawAction, index) : null))
    .filter((action): action is AgentAction => Boolean(action))
    .slice(0, 5);

  return {
    message: content.replace(ACTION_BLOCK_PATTERN, "").trim(),
    actions,
  };
}
