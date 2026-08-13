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

// --- Brain-dump fragment splitting -----------------------------------------

// Lexical splitter for "how many separate obligations does this text likely
// mention". Real item boundaries come from the model (see prompts.ts); this
// only backs the fallback card draft (schema.ts) and the chat-tab routing
// detector below, so it just has to be a usable approximation.
export function splitDumpFragments(text: string): string[] {
  return text
    .split(/[\n.;,!?]|(?:하고|해야\s*하고|그리고)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

// Fragments that are the overwhelm complaint itself or the "what first?"
// question rather than a piece of work. They must not become fallback items:
// otherwise the deterministic fallback can end up recommending "해야 할 게
// 너무 많아서 시작을 못 하겠어" as the first work item.
const NOISE_FRAGMENT_PATTERNS: RegExp[] = [
  /뭐부터|무엇부터|어디서부터|어떤\s*것부터|뭐\s*먼저/,
  /너무\s*많/,
  /시작(을|이)?\s*못|손에\s*안\s*잡|엄두가?\s*안|감당이?\s*안|막막|모르겠/,
  /what\s+(should\s+i\s+)?(do|start|tackle)\s+first/i,
  /where\s+(do|should)\s+i\s+(start|begin)/i,
  /\boverwhelm|\btoo (much|many)\b|can'?t\s+(get\s+)?start/i,
];

// Trailing backlog/friction predicates carried by an otherwise real item,
// e.g. "중국어 복습이 다 밀렸어" → "중국어 복습".
const TRAILING_PREDICATE = /(이|가)?\s*(다|전부|잔뜩|많이)?\s*(밀렸|밀려|쌓였|쌓여)[^]*$|\s+(is|are)\s+(all\s+)?(overdue|piling up|piled up)[^]*$/i;

// Work-item labels for the fallback card draft: split the dump, strip
// friction predicates, and drop complaint/question fragments — but never
// return an empty list when the raw split found something, so the fallback
// card always has at least one label to anchor on.
export function extractLikelyItemLabels(text: string): string[] {
  const fragments = splitDumpFragments(text);
  const cleaned = fragments
    .filter((fragment) => !NOISE_FRAGMENT_PATTERNS.some((pattern) => pattern.test(fragment)))
    .map((fragment) => fragment.replace(TRAILING_PREDICATE, "").trim())
    .filter((fragment) => fragment.length >= 2);
  return cleaned.length > 0 ? cleaned : fragments;
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

// --- Semantic priority signals ---------------------------------------------

// Fallback-draft items often carry a label and nothing else, so the flag/
// status-based score above ties across the board and the first-mentioned item
// wins by default. These lexical detectors read the item's own text fields to
// break such ties: external-deliverable projects and stuck debugging work are
// safer first execution units than routine learning. They are advisory only —
// they never write back to the item and never outrank explicit metadata.

// External deliverable / evaluation / submission signals: thesis-and-paper
// work, application paperwork, anything reviewed by an outside audience.
const EXTERNAL_PROJECT_PATTERNS: RegExp[] = [
  /논문|학위|초록|투고|심사|피드백|교수|지도교수|서류|제출|지원서|원서|마감/,
  /\bthesis\b|\bdissertation\b|\bpapers?\b|\bmanuscripts?\b|\bsubmissions?\b|\bsubmit\b/i,
  /\bfeedback\b|\bprofessors?\b|\badvisors?\b|\bapplications?\b|\bdeadlines?\b/i,
];

// Debugging/investigation signals: the safe first unit is recording a
// reproduction or an error message, not "fix it".
const DEBUGGING_PATTERNS: RegExp[] = [
  /버그|디버깅|디버그|오류|에러|크래시|재현/,
  /\bbugs?\b|\bdebug(ging)?\b|\berrors?\b|\bcrash(es|ing)?\b|\bstack\s*trace\b|\bfailing\s+tests?\b|\brepro(duce|duction)?\b|\bexceptions?\b/i,
];

// Routine, self-paced learning: postponable without external consequence, so
// it yields the first slot unless the user flagged friction on it.
const ROUTINE_LEARNING_PATTERNS: RegExp[] = [
  /리트코드|중국어|영어|일본어|단어\s*암기|단어장|복습|암기|문제\s*풀(이|기)/,
  /\bleetcode\b|\bflashcards?\b|\banki\b|\bduolingo\b|\bvocab(ulary)?\b/i,
];

export function looksLikeDeadlineOrExternalProject(text: string): boolean {
  return EXTERNAL_PROJECT_PATTERNS.some((pattern) => pattern.test(text));
}

export function looksLikeDebuggingItem(text: string): boolean {
  return DEBUGGING_PATTERNS.some((pattern) => pattern.test(text));
}

export function looksLikeRoutineLearningItem(text: string): boolean {
  return ROUTINE_LEARNING_PATTERNS.some((pattern) => pattern.test(text));
}

export function itemSemanticText(item: DetectedItem): string {
  return [item.label, item.domain, item.workType, item.possibleOutput].join(" ");
}

// Bonus magnitudes are capped so semantic hints can never outrank explicit
// metadata: the largest reachable non-flag score is stuck(10) + unscoped(5) +
// external-project(25) = 40, below a bare externalPressure item's worst case
// of 50 − routine(4) = 46, which in turn stays below dependency(100).
const EXTERNAL_PROJECT_BONUS = 25;
const DEBUGGING_BONUS = 12;
const ROUTINE_LEARNING_PENALTY = 4;

// Pure read of the item's text fields — never mutates the item and never
// infers dependency/externalPressure. External-project wins over debugging
// wins over routine when one item matches several categories.
export function semanticPriorityBonus(item: DetectedItem): number {
  const text = itemSemanticText(item);
  if (looksLikeDeadlineOrExternalProject(text)) return EXTERNAL_PROJECT_BONUS;
  if (looksLikeDebuggingItem(text)) return DEBUGGING_BONUS;
  if (looksLikeRoutineLearningItem(text) && !looksStuck(item.status)) return -ROUTINE_LEARNING_PENALTY;
  return 0;
}

// Order from prompts.ts §Priority heuristic: a blocker that unblocks other
// work wins, then external deadlines, then a stuck point, then — only in the
// absence of those — an unscoped item worth de-fuzzing first. The semantic
// bonus breaks ties among label-only items; ties that remain keep input order
// (chooseFirstItem only replaces on a strictly higher score).
export function scoreItemForPriority(item: DetectedItem): number {
  let score = 0;
  if (item.dependency) score += 100;
  if (item.externalPressure) score += 50;
  if (looksStuck(item.status)) score += 10;
  if (!item.dependency && !item.externalPressure && looksUnscoped(item)) score += 5;
  score += semanticPriorityBonus(item);
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

// (The chat-tab routing detector shouldRouteToAssistantFlow was removed in
// Unified Chat slice 3: every message now goes through runAssistantTurn, whose
// model-side Scope Gate replaces this regex prefilter.)

// --- Fallback next action builder ------------------------------------------

// Category-level next-action templates keyed on what kind of work the item's
// own text says it is. Still derived from the item (label goes in the title),
// never a canned answer for one specific user input.
function buildSemanticFallbackAction(item: DetectedItem, semanticText: string): RecommendedNextAction | null {
  if (looksLikeDebuggingItem(semanticText)) {
    return {
      title: `${item.label}: 재현 조건 1개랑 에러 메시지 1개만 메모로 남기기`,
      reason: "바로 고치려 들기보다, 막힌 자리부터 기록해 두면 부담 없이 다시 움직일 수 있어요.",
      completionCriteria: "재현 조건 1개와 에러 메시지 1개가 메모로 남아 있으면 끝이에요.",
      estimatedDifficulty: "low",
    };
  }
  if (looksLikeDeadlineOrExternalProject(semanticText)) {
    return {
      title: `${item.label}: 오늘 볼 수정 포인트 1개 고르고, 메모 3줄만 남기기`,
      reason: "포인트 1개로 좁히면 지금 바로 시작할 수 있어요.",
      completionCriteria: "고른 포인트 1개와 메모 3줄이 남아 있으면 끝이에요.",
      estimatedDifficulty: "low",
    };
  }
  if (looksLikeRoutineLearningItem(semanticText)) {
    return {
      title: `${item.label}: 오늘 할 항목 1개만 골라서 기록하기`,
      reason: "밀린 학습은 항목 1개 기록으로 가볍게 다시 시작하는 게 안전해요.",
      completionCriteria: "그 항목 1개가 기록으로 남아 있으면 끝이에요.",
      estimatedDifficulty: "low",
    };
  }
  return null;
}

// Last-resort, fully deterministic next action for when the model's own
// reply fails validation. Always derived from the chosen item's own fields —
// never a fixed sentence unrelated to the parsed input.
//
// Category templates take precedence over the item's possible_output: a
// possible_output is usually the item's final deliverable ("피드백 반영된
// 논문 초안", "버그 수정 완료"), which is too big to be a first action —
// the next action must be physically startable within minutes and leave a
// small artifact, not demand the whole output up front.
export function buildFallbackNextActionForItem(item: DetectedItem): RecommendedNextAction {
  const semanticText = itemSemanticText(item);
  const semanticAction = buildSemanticFallbackAction(item, semanticText);
  if (semanticAction) return semanticAction;
  if (isObservableOutput(item.possibleOutput)) {
    const reason = item.dependency
      ? "다른 일이 여기에 걸려 있어서 먼저 처리해요."
      : item.externalPressure
        ? "마감·제출과 이어져 있어서 먼저 처리해요."
        : "지금 가장 작게 시작할 수 있는 일이에요.";
    return {
      title: `${item.label}: ${item.possibleOutput}`,
      reason,
      completionCriteria: `${item.possibleOutput} — 이게 실제로 남아 있으면 끝이에요.`,
      estimatedDifficulty: "low",
    };
  }
  return {
    title: `${item.label}: 다음에 뭘 할지 정하는 데 필요한 조건 1~2가지만 적어보기`,
    reason: "아직 산출물이 흐릿해서, 큰 결과물 대신 범위부터 좁혀요.",
    completionCriteria: "그 조건들이 메모나 목록으로 남아 있으면 끝이에요.",
    estimatedDifficulty: "low",
  };
}
