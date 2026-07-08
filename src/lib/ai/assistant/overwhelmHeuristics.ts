// Deterministic guard rails around the model's own judgment. The model
// decides response_mode/input_signals/detected_items via prompts.ts; these
// pure functions provide (a) a safe fallback classifier for when that field
// is missing/invalid — mirroring resolveMode() in schema.ts — and (b) the
// priority heuristic + fallback next-action builder used when the model's
// reply fails validateAssistantResponse's generic-failure guard.
import type { DetectedItem, RecommendedNextAction } from "../contextCards/types";
import type { InputSignals, ResponseMode, SignalStrength } from "./types";

const RESPONSE_MODES: readonly ResponseMode[] = [
  "domain_specific",
  "normal_task_request",
  "single_task_blocker",
  "planning_request",
  "learning_request",
  "overwhelm",
  "clarification_needed",
];

export function isValidResponseMode(value: unknown): value is ResponseMode {
  return typeof value === "string" && (RESPONSE_MODES as readonly string[]).includes(value);
}

function strengthRank(strength: SignalStrength): number {
  return strength === "strong" ? 2 : strength === "weak" ? 1 : 0;
}

function atLeastWeakCount(strengths: SignalStrength[]): number {
  return strengths.filter((strength) => strengthRank(strength) >= 1).length;
}

// Safety net only: used when the model omitted or malformed response_mode.
// Implements the combination rules from prompts.ts §Classifying the input
// state — a single weak signal, or "several items mentioned" alone, never
// resolves to "overwhelm" here.
export function resolveResponseMode(rawResponseMode: unknown, signals: InputSignals, itemCount: number): ResponseMode {
  if (isValidResponseMode(rawResponseMode)) return rawResponseMode;

  const strongDecisionOrFriction = signals.decisionSignal === "strong" || signals.frictionSignal === "strong";
  const weakComboCount = atLeastWeakCount([signals.decisionSignal, signals.frictionSignal, signals.lowActionabilitySignal]);

  if (itemCount >= 2 && (strongDecisionOrFriction || weakComboCount >= 2)) return "overwhelm";

  if (
    itemCount <= 1 &&
    strengthRank(signals.unscopedProjectSignal) >= 1 &&
    strengthRank(signals.lowActionabilitySignal) >= 1 &&
    strengthRank(signals.frictionSignal) >= 1
  ) {
    return "overwhelm";
  }

  if (itemCount === 0 && signals.frictionSignal !== "none") return "clarification_needed";
  if (itemCount >= 2) return "planning_request";
  if (itemCount === 1 && strengthRank(signals.unscopedProjectSignal) >= 1) return "planning_request";
  return "normal_task_request";
}

// --- Detected item boundary enforcement -----------------------------------

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Structural safeguard for "don't over-split on shared nouns": items that
// converge on the same non-empty possible_output within the same domain are
// merged, regardless of how many surface mentions produced them.
export function dedupeDetectedItems(items: DetectedItem[]): DetectedItem[] {
  const merged: DetectedItem[] = [];
  for (const item of items) {
    const outputKey = normalize(item.possibleOutput);
    const existing = outputKey
      ? merged.find((candidate) => normalize(candidate.possibleOutput) === outputKey && normalize(candidate.domain) === normalize(item.domain))
      : undefined;
    if (existing) {
      if (!existing.label.includes(item.label)) existing.label = `${existing.label} / ${item.label}`;
      existing.dependency = existing.dependency || item.dependency;
      existing.externalPressure = existing.externalPressure || item.externalPressure;
      continue;
    }
    merged.push({ ...item });
  }
  return merged;
}

export function itemsHaveWorkTypeOrOutput(items: DetectedItem[]): boolean {
  if (items.length === 0) return true;
  return items.every((item) => Boolean(item.workType.trim()) || Boolean(item.possibleOutput.trim()));
}

// --- Priority heuristic ----------------------------------------------------

function looksStuck(status: string): boolean {
  return /(막힘|막혀|정체|stuck|blocked)/i.test(status);
}

function looksUnscoped(item: DetectedItem): boolean {
  return !item.workType.trim() || !item.possibleOutput.trim() || /(불명확|흐릿|fuzzy|unscoped|vague)/i.test(item.domain + item.status);
}

// Order from prompts.ts §Priority heuristic: a blocker that unblocks other
// work wins, then external deadlines, then a stuck point, then — only in the
// absence of those — an unscoped item worth de-fuzzing first. Routine items
// carry no bonus so they sort last among equals.
export function scoreItemForPriority(item: DetectedItem): number {
  let score = 0;
  if (item.dependency) score += 100;
  if (item.externalPressure) score += 50;
  if (looksStuck(item.status)) score += 10;
  if (!item.dependency && !item.externalPressure && looksUnscoped(item)) score += 5;
  return score;
}

export function chooseFirstItem(items: DetectedItem[]): DetectedItem | null {
  if (items.length === 0) return null;
  let best = items[0];
  let bestScore = scoreItemForPriority(best);
  for (const item of items.slice(1)) {
    const score = scoreItemForPriority(item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

// --- Observable-output / vague-language checks -----------------------------

const VAGUE_PATTERNS: RegExp[] = [
  /이해(하면|되면|하고\s*나면)/,
  /열심히/,
  /어느\s*정도/,
  /시간이\s*지나면/,
  /기분이/,
  /노력하면/,
  /^\s*공부(\s*완료)?\s*$/,
  /^\s*(진행|정리)\s*(하기|해보기)?\s*$/,
  /\b(study|understand|feel better|make (an )?effort|try hard)\b/i,
  /^\s*(make progress|work on it|figure it out)\s*$/i,
];

// Used for both possible_output and completion_criteria: text must name
// something that will observably exist, not a state of mind or effort level.
export function isObservableOutput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !VAGUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isVagueCompletionCriteria(text: string): boolean {
  return !isObservableOutput(text);
}

// --- Timetable / generic-advice detectors (auxiliary signals) -------------

export function looksLikeTimetable(text: string): boolean {
  const timeMarkers = text.match(/\d{1,2}\s?(시|:\d{2}|am|pm)/gi) ?? [];
  const dayWords = text.match(/(월요일|화요일|수요일|목요일|금요일|토요일|일요일|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi) ?? [];
  return timeMarkers.length >= 3 || dayWords.length >= 3;
}

const GENERIC_FAILURE_PHRASES: RegExp[] = [
  /가장\s*(시급|중요)한\s*것부터/,
  /우선순위를\s*(정해|스스로\s*정)/,
  /무엇이\s*가장\s*중요/,
  /어떤\s*(것|활동)을\s*(선호|하고\s*싶)/,
  /목표를\s*(생각해|떠올려)/,
  /규칙적으로\s*(하|배분)/,
  /균형\s*있게\s*배분/,
  /큰\s*그림을\s*보고\s*단계적으로/,
  /what.?s most important to you/i,
  /what would you (like|prefer) to (do|focus)/i,
  /prioriti[sz]e (them|yourself|what matters)/i,
  /take it one step at a time/i,
  /break it down and tackle it gradually/i,
];

// Phrase-based signal only — a secondary hint, never the sole basis for a
// generic-failure verdict (see validateAssistantResponse.ts).
export function containsGenericFailurePhrases(text: string): boolean {
  return GENERIC_FAILURE_PHRASES.some((pattern) => pattern.test(text));
}

// --- Fallback next action builder ------------------------------------------

// Last-resort, fully deterministic next action for when the model's own
// reply fails validation. Always derived from the chosen item's own fields —
// never a fixed sentence unrelated to the parsed input.
export function buildFallbackNextActionForItem(item: DetectedItem): RecommendedNextAction {
  if (isObservableOutput(item.possibleOutput)) {
    const reason = item.dependency
      ? "다른 항목의 진행을 막고 있어 먼저 처리합니다."
      : item.externalPressure
        ? "외부 마감/제출과 연결되어 있어 먼저 처리합니다."
        : "지금 가장 작게 시작할 수 있는 항목입니다.";
    return {
      title: `${item.label}: ${item.possibleOutput}`,
      reason,
      completionCriteria: `${item.possibleOutput}이(가) 실제로 남아 있으면 완료입니다.`,
      estimatedDifficulty: "low",
    };
  }
  return {
    title: `${item.label}: 다음 실행 단위를 정하는 데 필요한 조건 1~2가지 적어보기`,
    reason: "산출물이나 다음 행동이 아직 불명확해서, 큰 결과물 대신 범위부터 좁힙니다.",
    completionCriteria: "그 조건들이 메모나 목록으로 남아 있으면 완료입니다.",
    estimatedDifficulty: "low",
  };
}
