// Safe parsing of the assistant's JSON reply (see prompts.ts for the schema
// the model is asked to follow). Everything here is defensive: the local
// model regularly wraps JSON in prose or markdown fences, truncates fields,
// omits new fields, or returns free text — none of that may break the app.
// When no usable JSON arrives, callers get null and must treat it as a
// Generic Failure Guard failure (deterministic fallback text + heuristic
// fallback card draft) — never surface the raw reply.
import type {
  ContextCardDraft,
  DetectedItem,
  InfoSlot,
  InfoSlotKind,
  InfoSlotSource,
  NextActionDifficulty,
  PlanStep,
  RecommendedNextAction,
} from "../contextCards/types";
import { dedupeDetectedItems, extractLikelyItemLabels, resolveResponseMode } from "./overwhelmHeuristics";
import type { AssistantAnalysis, AssistantMode, AssistantSafeActionProposal, InputSignals, SignalStrength } from "./types";

const MAX_LIST_ITEMS = 10;
const MAX_ITEM_CHARS = 300;
const MAX_FOLLOW_UP_QUESTIONS = 3;
// Overwhelm/clarification responses hand the user one decision at most, not
// up to three — see prompts.ts §Responding in overwhelm mode.
const MAX_FOLLOW_UP_QUESTIONS_TIGHT = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, maxChars = MAX_ITEM_CHARS): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

function cleanStringArray(value: unknown, maxItems = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanDifficulty(value: unknown): NextActionDifficulty | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function cleanSignalStrength(value: unknown): SignalStrength {
  return value === "weak" || value === "strong" ? value : "none";
}

function parseInputSignals(value: unknown): InputSignals {
  const record = isRecord(value) ? value : {};
  return {
    decisionSignal: cleanSignalStrength(record.decision_signal),
    frictionSignal: cleanSignalStrength(record.friction_signal),
    lowActionabilitySignal: cleanSignalStrength(record.low_actionability_signal),
    blockerSignal: cleanSignalStrength(record.blocker_signal),
    externalPressureSignal: cleanSignalStrength(record.external_pressure_signal),
    unscopedProjectSignal: cleanSignalStrength(record.unscoped_project_signal),
  };
}

// Pulls the first plausible JSON object out of a model reply: the whole
// string, a fenced ```json block, or the outermost {...} span — in that order.
function extractJsonObject(content: string): Record<string, unknown> | null {
  const candidates: string[] = [content.trim()];
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const first = content.indexOf("{");
  const last = content.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(content.slice(first, last + 1));

  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function parseNextAction(value: unknown): RecommendedNextAction | null {
  if (!isRecord(value)) return null;
  const title = cleanString(value.title);
  if (!title) return null;
  return {
    title,
    reason: cleanString(value.reason),
    completionCriteria: cleanString(value.completion_criteria),
    estimatedDifficulty: cleanDifficulty(value.estimated_difficulty),
  };
}

// One detected_items entry may arrive as a plain string (legacy shape, or a
// smaller model that ignores the structured form) or as the structured
// object prompts.ts asks for. Either way we normalize to a full DetectedItem
// so downstream heuristics never have to branch on shape.
function parseDetectedItem(value: unknown): DetectedItem | null {
  if (typeof value === "string") {
    const label = cleanString(value, 120);
    if (!label) return null;
    return { label, domain: "", workType: "", status: "", possibleOutput: "", dependency: false, externalPressure: false };
  }
  if (!isRecord(value)) return null;
  const label = cleanString(value.label, 120);
  if (!label) return null;
  return {
    label,
    domain: cleanString(value.domain, 80),
    workType: cleanString(value.work_type, 80),
    status: cleanString(value.status, 120),
    possibleOutput: cleanString(value.possible_output, 160),
    dependency: value.dependency === true,
    externalPressure: value.external_pressure === true,
  };
}

const INFO_SLOT_KINDS: readonly InfoSlotKind[] = ["done_criteria", "deadline", "blocked_point", "prerequisite", "time_budget", "scope_boundary"];

function cleanInfoSlotSource(value: unknown): InfoSlotSource | undefined {
  return value === "user_answer" || value === "derived" || value === "assumed_default" ? value : undefined;
}

// info_slots entries the model emits: unknown kinds are dropped, one slot per
// kind (first wins), and a filled answer without a source defaults to
// "derived" so the merge layer can rank it.
function parseInfoSlots(value: unknown): InfoSlot[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<InfoSlotKind>();
  const slots: InfoSlot[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const kind = entry.kind;
    if (typeof kind !== "string" || !(INFO_SLOT_KINDS as readonly string[]).includes(kind)) continue;
    if (seen.has(kind as InfoSlotKind)) continue;
    seen.add(kind as InfoSlotKind);
    const answer = cleanString(entry.answer, 200);
    slots.push({
      kind: kind as InfoSlotKind,
      question: cleanString(entry.question, 200),
      answer,
      source: answer ? (cleanInfoSlotSource(entry.source) ?? "derived") : undefined,
    });
  }
  return slots;
}

// plan_steps entries the model emits. Only shape-level cleaning happens here;
// the SMART quality bar (validate/repair/fallback) is applied later by
// planSteps.ts, and only for cards that actually reach the planned stage.
const MAX_RAW_PLAN_STEPS = 6;

function parsePlanSteps(value: unknown): PlanStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map(
      (entry): PlanStep => ({
        title: cleanString(entry.title, 160),
        why: cleanString(entry.why, 200),
        startCue: cleanString(entry.start_cue, 120),
        completionCriteria: cleanString(entry.completion_criteria, 200),
      }),
    )
    .filter((step) => step.title)
    .slice(0, MAX_RAW_PLAN_STEPS);
}

function parseDetectedItems(value: unknown): DetectedItem[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map(parseDetectedItem)
    .filter((item): item is DetectedItem => item !== null)
    .slice(0, MAX_LIST_ITEMS);
  return dedupeDetectedItems(items);
}

function parseCardDraft(value: unknown, rawInput: string): ContextCardDraft | null {
  if (!isRecord(value)) return null;
  const title = cleanString(value.title, 120);
  if (!title) return null;
  const items = parseDetectedItems(value.detected_items);
  return {
    title,
    // Always keep the user's actual input, not the model's echo of it.
    rawInput,
    detectedItems: items.map((item) => item.label),
    inferredDomains: [...new Set(items.map((item) => item.domain).filter(Boolean))],
    workTypes: [...new Set(items.map((item) => item.workType).filter(Boolean))],
    currentStatus: items.map((item) => item.status).filter(Boolean),
    likelyBlockers: cleanStringArray(value.likely_blockers),
    missingInfo: cleanStringArray(value.missing_info),
    possibleOutputs: items.map((item) => item.possibleOutput).filter(Boolean),
    detectedItemDetails: items,
    infoSlots: parseInfoSlots(value.info_slots),
    plan: parsePlanSteps(value.plan_steps),
    relatedTaskIds: cleanStringArray(value.related_task_ids),
    relatedProjectIds: cleanStringArray(value.related_project_ids),
    relatedNotePaths: cleanStringArray(value.related_note_paths, 5),
  };
}

function parseSafeActionProposals(value: unknown): AssistantSafeActionProposal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => item.type === "create_task")
    .map((item) => ({
      type: "create_task" as const,
      title: cleanString(item.title, 160),
      description: cleanString(item.description, 500),
      linkedContextCardId: cleanString(item.linked_context_card_id, 80),
    }))
    .filter((item) => item.title)
    .slice(0, 3);
}


// Small local models frequently drop or garble a single enum field while
// still following the rest of the schema (e.g. they emit follow_up_questions
// but omit "mode"). Trusting a blind default here would silently hide real
// questions/actions from the user, so an invalid/missing mode is inferred
// from whichever payload is actually present instead of always assuming
// "ready_for_next_action".
function resolveMode(
  rawMode: unknown,
  followUpQuestions: string[],
  recommendedNextAction: RecommendedNextAction | null,
): AssistantMode {
  if (rawMode === "needs_more_context" || rawMode === "ready_for_next_action") return rawMode;
  if (recommendedNextAction) return "ready_for_next_action";
  if (followUpQuestions.length > 0) return "needs_more_context";
  return "ready_for_next_action";
}

// null analysis = the reply contained no usable JSON. Callers must NOT show
// the raw text: runAssistantTurn treats null as a validation failure and
// routes it through buildFallbackOverwhelmResponse + the fallback card draft.
export function parseAssistantResponse(content: string, rawInput: string): AssistantAnalysis | null {
  const json = extractJsonObject(content);
  if (!json) return null;

  const inputSignals = parseInputSignals(json.input_signals);
  const contextCardDraft = parseCardDraft(json.context_card_draft, rawInput);
  const itemCount = contextCardDraft?.detectedItemDetails?.length ?? 0;
  const responseMode = resolveResponseMode(json.response_mode, inputSignals, itemCount);

  const followUpCap =
    responseMode === "overwhelm" || responseMode === "clarification_needed" ? MAX_FOLLOW_UP_QUESTIONS_TIGHT : MAX_FOLLOW_UP_QUESTIONS;
  const followUpQuestions = cleanStringArray(json.follow_up_questions, followUpCap);
  const recommendedNextAction = parseNextAction(json.recommended_next_action);

  return {
    mode: resolveMode(json.mode, followUpQuestions, recommendedNextAction),
    responseMode,
    inputSignals,
    contextCardDraft,
    followUpQuestions,
    recommendedNextAction,
    safeActionProposals: parseSafeActionProposals(json.safe_action_proposals),
    userFacingResponse: cleanString(json.user_facing_response, 2000),
  };
}

// Heuristic draft used when the model returned free text (or a JSON reply
// without a card): split the dump into fragments so the user still gets a
// saveable, editable starting point instead of a dead end.
export function buildFallbackContextCardDraft(rawInput: string): ContextCardDraft {
  const fragments = extractLikelyItemLabels(rawInput).slice(0, 8);
  const title = rawInput.trim().replace(/\s+/g, " ").slice(0, 60) || "Brain dump";
  const items: DetectedItem[] = fragments.map((label) => ({
    label,
    domain: "",
    workType: "",
    status: "",
    possibleOutput: "",
    dependency: false,
    externalPressure: false,
  }));
  return {
    title,
    rawInput,
    detectedItems: fragments,
    inferredDomains: [],
    workTypes: [],
    currentStatus: [],
    likelyBlockers: [],
    missingInfo: [],
    possibleOutputs: [],
    detectedItemDetails: items,
    relatedTaskIds: [],
    relatedProjectIds: [],
    relatedNotePaths: [],
  };
}
