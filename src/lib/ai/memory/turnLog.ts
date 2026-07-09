// Turn log (User Patterns slice A): the raw material for later pattern
// analysis. Persists what each AI exchange already computes and then throws
// away — response mode, input signals, card stage, domains — alongside the
// conversation text, so "when/about what does the user get stuck, and what
// do they accept?" becomes answerable later (slice B aggregates, slice C
// promotes model-proposed memories with user approval; see
// docs/Features/User_Patterns.md).
//
// Privacy rules: device-local KV only (never synced), user-visible toggle,
// one-click full delete. Logging is best-effort and must never block a turn.
import { platform } from "../../../platform";
import type { AssistantTurn, InputSignals, ResponseMode } from "../assistant/types";
import type { CardStage } from "../contextCards/types";

const STORAGE_KEY = "focusflow.aiTurnLog.v1";
const ENABLED_KEY = "focusflow.aiTurnLog.enabled";
// Rolling cap: newest entries win. ~200 turns is months of normal use and
// keeps the blob far from localStorage limits even with the text caps below.
const MAX_ENTRIES = 200;
const MAX_USER_TEXT = 2000;
const MAX_ASSISTANT_TEXT = 1200;

export type AiTurnLogSource = "assistant_panel" | "chat_assistant" | "chat_free";

export type AiTurnLogEntry = {
  id: string;
  source: AiTurnLogSource;
  userText: string;
  // User-facing reply only — never the [draft] history echo.
  assistantText: string;
  // Assistant-flow metadata; absent on free-chat turns.
  responseMode?: ResponseMode;
  inputSignals?: InputSignals;
  stage?: CardStage;
  domains?: string[];
  usedGenericFailureFallback?: boolean;
  // Link into the outcome log (proposed → saved_as_task/rejected), so later
  // analysis can join "what was suggested" with "what the user did".
  outcomeId?: string;
  provider?: string;
  createdAt: string;
};

const SOURCES: readonly AiTurnLogSource[] = ["assistant_panel", "chat_assistant", "chat_free"];

export function isTurnLogEnabled(): boolean {
  try {
    // Default ON: the log is the point of the feature and stays device-local;
    // the settings toggle writes "0" to opt out.
    return platform.storage.getSync(ENABLED_KEY) !== "0";
  } catch {
    return false;
  }
}

export function setTurnLogEnabled(enabled: boolean) {
  try {
    platform.storage.setSync(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Storage unavailable — nothing to toggle.
  }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sanitizeEntry(value: unknown): AiTurnLogEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.userText !== "string") return null;
  return {
    id: record.id,
    source: SOURCES.includes(record.source as AiTurnLogSource) ? (record.source as AiTurnLogSource) : "chat_free",
    userText: record.userText,
    assistantText: typeof record.assistantText === "string" ? record.assistantText : "",
    // Written by this module only; shape is trusted after the object check.
    responseMode: typeof record.responseMode === "string" ? (record.responseMode as ResponseMode) : undefined,
    inputSignals: record.inputSignals && typeof record.inputSignals === "object" ? (record.inputSignals as InputSignals) : undefined,
    stage: typeof record.stage === "string" ? (record.stage as CardStage) : undefined,
    domains: Array.isArray(record.domains) ? record.domains.filter((d): d is string => typeof d === "string") : undefined,
    usedGenericFailureFallback: typeof record.usedGenericFailureFallback === "boolean" ? record.usedGenericFailureFallback : undefined,
    outcomeId: typeof record.outcomeId === "string" ? record.outcomeId : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}

// Newest first.
export function loadTurnLog(): AiTurnLogEntry[] {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeEntry)
      .filter((entry): entry is AiTurnLogEntry => entry !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function persist(entries: AiTurnLogEntry[]) {
  const bounded = [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ENTRIES);
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Best-effort: a full/unavailable store must never block the turn.
  }
}

function append(entry: AiTurnLogEntry) {
  persist([entry, ...loadTurnLog()]);
}

// One assistant-flow exchange (panel or chat routing). No-op when disabled.
export function logAssistantTurn(args: {
  source: Exclude<AiTurnLogSource, "chat_free">;
  userText: string;
  turn: AssistantTurn;
  outcomeId?: string;
}) {
  if (!isTurnLogEnabled()) return;
  append({
    id: args.turn.id,
    source: args.source,
    userText: clip(args.userText, MAX_USER_TEXT),
    assistantText: clip(args.turn.userFacingText, MAX_ASSISTANT_TEXT),
    responseMode: args.turn.responseMode,
    inputSignals: args.turn.inputSignals,
    stage: args.turn.contextCardDraft.stage,
    domains: args.turn.contextCardDraft.inferredDomains.slice(0, 5),
    usedGenericFailureFallback: args.turn.usedGenericFailureFallback,
    outcomeId: args.outcomeId,
    provider: args.turn.provider,
    createdAt: new Date().toISOString(),
  });
}

// One free-chat exchange (personal agent). No signals/stage — text and
// provider only. No-op when disabled.
export function logFreeChatTurn(args: { userText: string; assistantText: string; provider?: string }) {
  if (!isTurnLogEnabled()) return;
  append({
    id: `chatturn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source: "chat_free",
    userText: clip(args.userText, MAX_USER_TEXT),
    assistantText: clip(args.assistantText, MAX_ASSISTANT_TEXT),
    provider: args.provider,
    createdAt: new Date().toISOString(),
  });
}

export function clearTurnLog() {
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify([]));
  } catch {
    // Storage unavailable — nothing stored anyway.
  }
}

export function turnLogCount(): number {
  return loadTurnLog().length;
}
