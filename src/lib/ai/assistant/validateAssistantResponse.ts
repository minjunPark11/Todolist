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
  itemSemanticText,
  itemsHaveWorkTypeOrOutput,
  looksLikeDeadlineOrExternalProject,
  looksLikeDebuggingItem,
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

  // One- or two-sentence reason (never a lecture): explicit flags first, then
  // the same category signals the priority heuristic used, so the stated
  // reason matches why the item actually won.
  const chosenText = itemSemanticText(chosen);
  const reasonLine = chosen.dependency
    ? `그 중 "${chosen.label}"이 다른 일의 진행을 막고 있어 먼저 잡는 게 안전합니다.`
    : chosen.externalPressure
      ? `그 중 "${chosen.label}"이 외부 마감/제출과 연결되어 있어 먼저 잡는 게 안전합니다.`
      : looksLikeDeadlineOrExternalProject(chosenText)
        ? `그 중 "${chosen.label}"은 결과물이 남고 외부 피드백/제출로 이어지기 쉬워 먼저 잡는 게 좋습니다.`
        : looksLikeDebuggingItem(chosenText)
          ? `그 중 "${chosen.label}"은 막힌 지점을 기록만 해도 다시 움직이기 쉬워서 먼저 잡습니다.`
          : `그 중 "${chosen.label}"을 첫 실행 단위로 잡습니다.`;

  const recommendedNextAction = buildFallbackNextActionForItem(chosen);

  // The rest is parked, not dropped: name the remaining items and defer the
  // decision to the next execution unit instead of asking the user anything.
  const remainingLabels = deduped.filter((item) => item.label !== chosen.label).map((item) => item.label);
  const holdLine =
    remainingLabels.length > 0
      ? `나머지(${remainingLabels.join(", ")})는 버리는 게 아니라 보류입니다 — 이 행동이 끝난 뒤 다음 실행 단위를 정할 때 다시 봅니다.`
      : "";

  const userFacingResponse = [
    diagnosis,
    deduped.length >= 2 ? `정리하면: ${summaryLine}.` : "",
    reasonLine,
    `다음 행동: ${recommendedNextAction.title}.`,
    holdLine,
  ]
    .filter(Boolean)
    .join(" ");

  return { userFacingResponse, recommendedNextAction, followUpQuestions: [] };
}
