// Generic Failure Guard (structural, not just phrase-matching) + the
// deterministic fallback used when a model reply fails it. Scope: only
// "overwhelm" and "planning_request" responses are held to these rules —
// domain_specific/learning_request/direct answers keep their own mode's
// quality bar and are never touched here.
import type { DetectedItem, RecommendedNextAction } from "../contextCards/types";
import {
  buildFallbackNextActionForItem,
  chooseFirstItem,
  containsGenericFailurePhrases,
  dedupeDetectedItems,
  isObservableOutput,
  isVagueCompletionCriteria,
  itemsHaveWorkTypeOrOutput,
  looksLikeTimetable,
} from "./overwhelmHeuristics";
import type { AssistantAnalysis, ResponseValidationResult } from "./types";

const GUARDED_MODES = new Set(["overwhelm", "planning_request"]);

function itemMentioned(text: string, items: DetectedItem[]): boolean {
  return items.some((item) => {
    const tokens = item.label.split(/[\s/·,]+/).filter((token) => token.length >= 2);
    return tokens.length > 0 ? tokens.some((token) => text.includes(token)) : text.includes(item.label);
  });
}

// Structural conditions are checked first and drive the verdict; the phrase
// blacklist (containsGenericFailurePhrases) only adds signal on top — it
// never overrides a structurally sound response into a failure by itself
// being the sole reason, and it never rescues a structurally broken one.
export function validateAssistantResponse(analysis: AssistantAnalysis, items: DetectedItem[]): ResponseValidationResult {
  if (!GUARDED_MODES.has(analysis.responseMode)) return { ok: true, failures: [] };

  const failures: string[] = [];
  const text = analysis.userFacingResponse ?? "";
  const isOverwhelm = analysis.responseMode === "overwhelm";

  if (items.length >= 2 && !itemsHaveWorkTypeOrOutput(items)) {
    failures.push("detected_items missing work_type/possible_output");
  }
  for (const item of items) {
    if (item.possibleOutput.trim() && !isObservableOutput(item.possibleOutput)) {
      failures.push(`possible_output not observable for "${item.label}"`);
    }
  }

  if (isOverwhelm) {
    if (!analysis.recommendedNextAction) {
      failures.push("overwhelm response has no next action");
    } else if (!analysis.recommendedNextAction.completionCriteria.trim()) {
      failures.push("next action missing completion criteria");
    } else if (isVagueCompletionCriteria(analysis.recommendedNextAction.completionCriteria)) {
      failures.push("completion criteria is not observable");
    }

    if (analysis.followUpQuestions.length > 1) {
      failures.push("overwhelm response asks more than one follow-up question");
    }

    if (items.length > 0 && !itemMentioned(text, items)) {
      failures.push("response does not reference any detected item");
    }
  } else if (analysis.recommendedNextAction?.completionCriteria.trim() && isVagueCompletionCriteria(analysis.recommendedNextAction.completionCriteria)) {
    failures.push("completion criteria is not observable");
  }

  if (looksLikeTimetable(text)) failures.push("response contains an unrequested timetable/schedule");
  if (containsGenericFailurePhrases(text)) failures.push("response contains generic, item-independent advice");

  return { ok: failures.length === 0, failures };
}

export type FallbackOverwhelmResponse = {
  userFacingResponse: string;
  recommendedNextAction: RecommendedNextAction;
  followUpQuestions: string[];
};

// Built entirely from the actual parsed items — never a canned sentence
// unrelated to the input. Used only when validateAssistantResponse fails.
export function buildFallbackOverwhelmResponse(rawInput: string, items: DetectedItem[]): FallbackOverwhelmResponse {
  const deduped = dedupeDetectedItems(items);
  const chosen =
    chooseFirstItem(deduped) ??
    ({
      label: rawInput.trim().slice(0, 40) || "입력한 내용",
      domain: "",
      workType: "",
      status: "",
      possibleOutput: "",
      dependency: false,
      externalPressure: false,
    } satisfies DetectedItem);

  const summaryLine = deduped.map((item) => `${item.label}(${item.workType || item.possibleOutput || "정리 필요"})`).join(", ");

  const diagnosis =
    deduped.length >= 2
      ? `${deduped.length}개의 일이 섞여 있어서 지금 어디부터 시작할지 실행 단위가 흐려진 상태로 보입니다.`
      : `"${chosen.label}"이 아직 작은 실행 단위로 쪼개지지 않아 시작점이 보이지 않는 상태로 보입니다.`;

  const reasonLine = chosen.dependency
    ? `그 중 "${chosen.label}"이 다른 일의 진행을 막고 있어 먼저 잡는 게 안전합니다.`
    : chosen.externalPressure
      ? `그 중 "${chosen.label}"이 외부 마감/제출과 연결되어 있어 먼저 잡는 게 안전합니다.`
      : `그 중 "${chosen.label}"을 첫 실행 단위로 잡습니다.`;

  const recommendedNextAction = buildFallbackNextActionForItem(chosen);

  const userFacingResponse = [
    diagnosis,
    deduped.length >= 2 ? `정리하면: ${summaryLine}.` : "",
    reasonLine,
    `다음 행동: ${recommendedNextAction.title}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return { userFacingResponse, recommendedNextAction, followUpQuestions: [] };
}
