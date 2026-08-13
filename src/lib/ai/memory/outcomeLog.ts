// Outcome log for AI-proposed actions: the minimal record of what the
// assistant suggested and what the user did with it. MVP 2 stops here — no
// automatic long-term memory is derived from these entries yet; a future
// memory builder (see types.ts AiMemoryStore) will consume them. Same
// device-local storage pattern as context cards: no schema change, no sync.
import { platform } from "../../../platform";
import type { AiSafeAction } from "../actions/types";

export type OutcomeStatus = "proposed" | "accepted" | "rejected" | "saved_as_task" | "failed";

export type AiOutcomeLogEntry = {
  id: string;
  assistantTurnId: string;
  contextCardId?: string;
  proposedAction: AiSafeAction;
  status: OutcomeStatus;
  savedTaskId?: string;
  userFeedback?: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "focusflow.aiOutcomeLog.v1";
// Newest entries win; older ones are pruned so the blob stays small.
const MAX_ENTRIES = 300;

const STATUSES: OutcomeStatus[] = ["proposed", "accepted", "rejected", "saved_as_task", "failed"];

function sanitizeEntry(value: unknown): AiOutcomeLogEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (!record.proposedAction || typeof record.proposedAction !== "object") return null;
  return {
    id: record.id,
    assistantTurnId: typeof record.assistantTurnId === "string" ? record.assistantTurnId : "",
    contextCardId: typeof record.contextCardId === "string" ? record.contextCardId : undefined,
    // Persisted by this module only; shape is trusted after the object check.
    proposedAction: record.proposedAction as AiSafeAction,
    status: STATUSES.includes(record.status as OutcomeStatus) ? (record.status as OutcomeStatus) : "proposed",
    savedTaskId: typeof record.savedTaskId === "string" ? record.savedTaskId : undefined,
    userFeedback: typeof record.userFeedback === "string" ? record.userFeedback : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

export function loadOutcomeLog(): AiOutcomeLogEntry[] {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeEntry).filter((entry): entry is AiOutcomeLogEntry => entry !== null);
  } catch {
    return [];
  }
}

function persist(entries: AiOutcomeLogEntry[]) {
  const bounded = [...entries]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_ENTRIES);
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Storage unavailable — logging is best-effort and must never block the
    // assistant flow.
  }
}

export function logProposedOutcome(args: {
  assistantTurnId: string;
  proposedAction: AiSafeAction;
  contextCardId?: string;
}): AiOutcomeLogEntry {
  const now = new Date().toISOString();
  const entry: AiOutcomeLogEntry = {
    id: `outcome-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    assistantTurnId: args.assistantTurnId,
    contextCardId: args.contextCardId,
    proposedAction: args.proposedAction,
    status: "proposed",
    createdAt: now,
    updatedAt: now,
  };
  persist([entry, ...loadOutcomeLog()]);
  return entry;
}

export function updateOutcome(
  id: string,
  patch: Partial<Pick<AiOutcomeLogEntry, "status" | "savedTaskId" | "userFeedback" | "contextCardId">>,
): AiOutcomeLogEntry | null {
  const entries = loadOutcomeLog();
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) return null;
  const updated: AiOutcomeLogEntry = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  persist(entries.map((entry) => (entry.id === id ? updated : entry)));
  return updated;
}
