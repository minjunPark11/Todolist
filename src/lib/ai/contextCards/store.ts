// Context Card persistence. Deliberately a plain local key-value blob (same
// platform.storage used by focus settings) rather than a new DB table or a
// synced planner collection: cards are device-local AI artifacts, and keeping
// them out of the Supabase-synced dataset needs no schema change and no
// migration. Swap this file for a DB-backed store later without touching
// callers.
import { platform } from "../../../platform";
import type { CardStage, ContextCard, ContextCardDraft, InfoSlot, PlanStep, RecommendedNextAction } from "./types";

const STORAGE_KEY = "focusflow.aiContextCards.v1";
// Oldest-updated cards are pruned past this cap so the blob stays small.
const MAX_CARDS = 200;

function asStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, maxItems);
}

function asOptionalNextAction(value: unknown): RecommendedNextAction | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || !record.title.trim()) return undefined;
  const difficulty = record.estimatedDifficulty;
  return {
    title: record.title.trim(),
    reason: typeof record.reason === "string" ? record.reason : "",
    completionCriteria: typeof record.completionCriteria === "string" ? record.completionCriteria : "",
    estimatedDifficulty:
      difficulty === "low" || difficulty === "medium" || difficulty === "high" ? difficulty : undefined,
  };
}

const INFO_SLOT_KINDS = new Set(["done_criteria", "deadline", "blocked_point", "prerequisite", "time_budget", "scope_boundary"]);
const CARD_STAGES = new Set(["goal_captured", "scoping", "info_gathering", "planned", "executing"]);

function asOptionalInfoSlots(value: unknown): InfoSlot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slots = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .filter((entry) => typeof entry.kind === "string" && INFO_SLOT_KINDS.has(entry.kind))
    .map((entry): InfoSlot => {
      const source = entry.source;
      return {
        kind: entry.kind as InfoSlot["kind"],
        question: typeof entry.question === "string" ? entry.question : "",
        answer: typeof entry.answer === "string" ? entry.answer : "",
        source: source === "user_answer" || source === "derived" || source === "assumed_default" ? source : undefined,
      };
    })
    .slice(0, 6);
  return slots.length > 0 ? slots : undefined;
}

function asOptionalPlanSteps(value: unknown): PlanStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .filter((entry) => typeof entry.title === "string" && entry.title.trim() !== "")
    .map(
      (entry): PlanStep => ({
        title: (entry.title as string).trim(),
        why: typeof entry.why === "string" ? entry.why : "",
        startCue: typeof entry.startCue === "string" ? entry.startCue : "",
        completionCriteria: typeof entry.completionCriteria === "string" ? entry.completionCriteria : "",
      }),
    )
    .slice(0, 4);
  return steps.length > 0 ? steps : undefined;
}

function asOptionalStage(value: unknown): CardStage | undefined {
  return typeof value === "string" && CARD_STAGES.has(value) ? (value as CardStage) : undefined;
}

function sanitizeCard(value: unknown): ContextCard | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  return {
    id: record.id,
    title: record.title.trim(),
    rawInput: typeof record.rawInput === "string" ? record.rawInput : "",
    detectedItems: asStringArray(record.detectedItems),
    inferredDomains: asStringArray(record.inferredDomains),
    workTypes: asStringArray(record.workTypes),
    currentStatus: asStringArray(record.currentStatus),
    likelyBlockers: asStringArray(record.likelyBlockers),
    missingInfo: asStringArray(record.missingInfo),
    possibleOutputs: asStringArray(record.possibleOutputs),
    infoSlots: asOptionalInfoSlots(record.infoSlots),
    stage: asOptionalStage(record.stage),
    plan: asOptionalPlanSteps(record.plan),
    recommendedNextAction: asOptionalNextAction(record.recommendedNextAction),
    relatedTaskIds: asStringArray(record.relatedTaskIds),
    relatedProjectIds: asStringArray(record.relatedProjectIds),
    relatedNotePaths: asStringArray(record.relatedNotePaths),
    source: record.source === "user" || record.source === "brain_dump" ? record.source : "assistant",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

export function loadContextCards(): ContextCard[] {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCard).filter((card): card is ContextCard => card !== null);
  } catch {
    return [];
  }
}

function persist(cards: ContextCard[]) {
  const bounded = [...cards]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CARDS);
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Storage may be unavailable (private mode / quota); the card stays
    // usable in memory for this session and the app keeps working.
  }
}

export function saveContextCard(draft: ContextCardDraft, source: ContextCard["source"] = "brain_dump"): ContextCard {
  const now = new Date().toISOString();
  const card: ContextCard = {
    ...draft,
    id: `ccard-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source,
    createdAt: now,
    updatedAt: now,
  };
  persist([card, ...loadContextCards()]);
  return card;
}

export function updateContextCard(id: string, patch: Partial<ContextCardDraft>): ContextCard | null {
  const cards = loadContextCards();
  const existing = cards.find((card) => card.id === id);
  if (!existing) return null;
  const updated: ContextCard = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  persist(cards.map((card) => (card.id === id ? updated : card)));
  return updated;
}

export function removeContextCard(id: string) {
  persist(loadContextCards().filter((card) => card.id !== id));
}
