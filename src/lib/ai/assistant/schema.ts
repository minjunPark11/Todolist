// Safe parsing of the assistant's JSON reply (see prompts.ts for the schema
// the model is asked to follow). Everything here is defensive: the local
// model regularly wraps JSON in prose or markdown fences, truncates fields,
// or returns free text — none of that may break the app. When no usable JSON
// arrives, callers still get the raw text plus a heuristic fallback card
// draft so the save flow keeps working.
import type { ContextCardDraft, NextActionDifficulty, RecommendedNextAction } from "../contextCards/types";
import type { AssistantAnalysis, AssistantMode, AssistantSafeActionProposal } from "./types";

const MAX_LIST_ITEMS = 10;
const MAX_ITEM_CHARS = 300;
const MAX_FOLLOW_UP_QUESTIONS = 3;

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

function parseCardDraft(value: unknown, rawInput: string): ContextCardDraft | null {
  if (!isRecord(value)) return null;
  const title = cleanString(value.title, 120);
  if (!title) return null;
  return {
    title,
    // Always keep the user's actual input, not the model's echo of it.
    rawInput,
    detectedItems: cleanStringArray(value.detected_items),
    inferredDomains: cleanStringArray(value.inferred_domains),
    workTypes: cleanStringArray(value.work_types),
    currentStatus: cleanStringArray(value.current_status),
    likelyBlockers: cleanStringArray(value.likely_blockers),
    missingInfo: cleanStringArray(value.missing_info),
    possibleOutputs: cleanStringArray(value.possible_outputs),
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

// null analysis = the reply contained no usable JSON; show the text as-is and
// fall back to a heuristic card draft.
export function parseAssistantResponse(content: string, rawInput: string): AssistantAnalysis | null {
  const json = extractJsonObject(content);
  if (!json) return null;

  const followUpQuestions = cleanStringArray(json.follow_up_questions, MAX_FOLLOW_UP_QUESTIONS);
  const recommendedNextAction = parseNextAction(json.recommended_next_action);
  return {
    mode: resolveMode(json.mode, followUpQuestions, recommendedNextAction),
    contextCardDraft: parseCardDraft(json.context_card_draft, rawInput),
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
  const fragments = rawInput
    .split(/[\n.;,!?]|(?:하고|해야\s*하고|그리고)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 8);
  const title = rawInput.trim().replace(/\s+/g, " ").slice(0, 60) || "Brain dump";
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
    relatedTaskIds: [],
    relatedProjectIds: [],
    relatedNotePaths: [],
  };
}
