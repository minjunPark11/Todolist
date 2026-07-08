// Type-only contract for the AI Assistant MVP's safe-action pipeline
// (propose → validate → user confirms → execute). No executor exists yet:
// the current chat's runtime actions still go through agent/actions.ts +
// tools/toolExecutor.ts. When the assistant lands, its executor should
// consume these types and the two action systems should merge — agent/
// actions.ts covers the create/split/update subset already shipping.
import type { TaskPriority } from "../../../types";

export type AiSafeActionType =
  | "create_task"
  | "split_task"
  | "set_next_action"
  | "start_focus_session"
  | "complete_task"
  | "save_context_card"
  | "log_intervention_outcome";

// Mirrors AgentActionRisk (agent/actions.ts): low may auto-apply after a
// single confirm, medium needs per-action review, high is reserved for
// destructive/irreversible proposals.
export type AiSafeActionRisk = "low" | "medium" | "high";

export type CreateTaskActionPayload = {
  title: string;
  dueDate?: string;
  projectId?: string;
  priority?: Exclude<TaskPriority, "none">;
};

export type SplitTaskActionPayload = {
  taskId: string;
  subtasks: string[];
};

// Marks one concrete next step on a task (e.g. flag a subtask or rewrite the
// task title into an actionable form) so "what do I do next" is never vague.
export type SetNextActionPayload = {
  taskId: string;
  nextAction: string;
};

export type StartFocusSessionActionPayload = {
  taskId: string;
  durationMinutes?: number;
};

export type CompleteTaskActionPayload = {
  taskId: string;
};

// Persists an assistant-drafted context card (see contextCards/types.ts).
export type SaveContextCardActionPayload = {
  title: string;
  body: string;
  taskId?: string;
  projectId?: string;
};

// Records whether an assistant suggestion actually helped, feeding AI memory
// (see memory/types.ts) so future suggestions improve.
export type LogInterventionOutcomeActionPayload = {
  interventionId: string;
  outcome: "helped" | "not_helpful" | "ignored";
  note?: string;
};

type AiSafeActionBase<TType extends AiSafeActionType, TPayload> = {
  id: string;
  type: TType;
  // Short human-readable description shown in the confirmation UI.
  label: string;
  risk: AiSafeActionRisk;
  payload: TPayload;
};

export type AiSafeAction =
  | AiSafeActionBase<"create_task", CreateTaskActionPayload>
  | AiSafeActionBase<"split_task", SplitTaskActionPayload>
  | AiSafeActionBase<"set_next_action", SetNextActionPayload>
  | AiSafeActionBase<"start_focus_session", StartFocusSessionActionPayload>
  | AiSafeActionBase<"complete_task", CompleteTaskActionPayload>
  | AiSafeActionBase<"save_context_card", SaveContextCardActionPayload>
  | AiSafeActionBase<"log_intervention_outcome", LogInterventionOutcomeActionPayload>;

// Default risk per action type; a proposer may raise (never lower) it.
export const AI_SAFE_ACTION_DEFAULT_RISK: Record<AiSafeActionType, AiSafeActionRisk> = {
  create_task: "low",
  split_task: "medium",
  set_next_action: "low",
  start_focus_session: "low",
  complete_task: "medium",
  save_context_card: "low",
  log_intervention_outcome: "low",
};
