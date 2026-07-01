import {
  getActionRiskLabel,
  getActionTypeLabel,
  requiresConfirmation,
  type AgentAction,
} from "../../lib/ai/agent/actions";
import type { ToolValidationResult } from "../../lib/ai/tools/toolExecutor";

type AgentActionPreviewProps = {
  actions: AgentAction[];
  validationResults?: ToolValidationResult[];
  canApply?: boolean;
  onDismiss: () => void;
  onRequestApply: () => void;
};

function formatPayload(action: AgentAction) {
  if (action.type === "create_task") {
    return [action.payload.title, action.payload.dueDate, action.payload.priority].filter(Boolean).join(" - ");
  }

  if (action.type === "create_calendar_event") {
    return [action.payload.title, action.payload.scheduledDate, action.payload.startTime].filter(Boolean).join(" - ");
  }

  if (action.type === "split_task") {
    return `${action.payload.subtasks.length} subtasks`;
  }

  if (action.type === "update_task_due_date") {
    return action.payload.dueDate;
  }

  return action.payload.priority;
}

function getValidationForAction(actionId: string, validationResults: ToolValidationResult[] = []) {
  return validationResults.find((result) => result.actionId === actionId);
}

export function AgentActionPreview({
  actions,
  validationResults = [],
  canApply = false,
  onDismiss,
  onRequestApply,
}: AgentActionPreviewProps) {
  if (actions.length === 0) {
    return null;
  }

  const hasInvalidAction = validationResults.some((result) => result.status === "invalid");
  const canRequestApply = canApply && actions.length > 0 && !hasInvalidAction;

  return (
    <div className="agent-action-preview" aria-label="AI suggested actions">
      <div className="agent-action-preview-head">
        <strong>Suggested actions</strong>
        <span>{canRequestApply ? "Needs confirmation" : "Review needed"}</span>
      </div>
      <div className="agent-action-list">
        {actions.map((action) => (
          <article key={action.id} className="agent-action-card">
            <div>
              <span>{getActionTypeLabel(action)}</span>
              <strong>{action.label}</strong>
              <small>{formatPayload(action)}</small>
              {getValidationForAction(action.id, validationResults)?.reason ? (
                <small className="agent-action-error">
                  {getValidationForAction(action.id, validationResults)?.reason}
                </small>
              ) : null}
            </div>
            <em>
              {getValidationForAction(action.id, validationResults)?.status === "invalid"
                ? "Invalid"
                : requiresConfirmation(action)
                  ? getActionRiskLabel(action.risk)
                  : "Read only"}
            </em>
          </article>
        ))}
      </div>
      <div className="agent-action-preview-actions">
        <button type="button" disabled={!canRequestApply} onClick={onRequestApply}>
          Apply
        </button>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
