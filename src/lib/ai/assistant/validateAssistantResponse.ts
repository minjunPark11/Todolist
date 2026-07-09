// Generic Failure Guard (structural, not just phrase-matching) + the
// deterministic fallback used when a model reply fails it. Scope: only
// "overwhelm" and "planning_request" responses are held to these rules —
// domain_specific/learning_request/direct answers keep their own mode's
// quality bar and are never touched here.
import type { DetectedItem, InfoSlot, RecommendedNextAction } from "../contextCards/types";
import { chooseNextSlotToAsk, resolveCardStage } from "./infoSlots";
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
//
// Body ↔ card contract: the body reassures, names the chosen item exactly
// once with a short reason, states the gathering state in plain words, and
// parks the rest. The next action title and completion criteria live only on
// the recommendation card (AssistantPanel) — never restated in the body.
export function buildFallbackOverwhelmResponse(rawInput: string, items: DetectedItem[], infoSlots: InfoSlot[] = []): FallbackOverwhelmResponse {
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

  const focusLine = deduped.length >= 2 ? "지금은 하나만 잡을게요." : "지금은 작게 하나만 잡을게요.";

  // Short natural reason, not a restated rule: explicit flags first, then the
  // same category signals the priority heuristic used, so the stated reason
  // matches why the item actually won. The chosen label appears here and only
  // here in the body.
  const chosenText = itemSemanticText(chosen);
  const reasonLine = chosen.dependency
    ? `우선 "${chosen.label}"부터 — 다른 일이 여기에 걸려 있어서, 이걸 풀어야 나머지가 움직여요.`
    : chosen.externalPressure
      ? `우선 "${chosen.label}"부터 — 마감이 걸려 있는 일이라 먼저 잡는 게 안전해요.`
      : looksLikeDeadlineOrExternalProject(chosenText)
        ? `우선 "${chosen.label}"부터 — 손대면 결과가 바로 남는 일이라 먼저 잡을게요.`
        : looksLikeDebuggingItem(chosenText)
          ? `우선 "${chosen.label}"부터 — 막힌 자리만 적어 둬도 다시 움직이기 쉬운 일이에요.`
          : `우선 "${chosen.label}"부터 시작할게요.`;

  const recommendedNextAction = buildFallbackNextActionForItem(chosen);

  // Info-gathering state in plain words only — internal stage/slot names never
  // reach the user. At most one optional follow-up question (guard rule);
  // the recommended action is startable whether or not it gets answered.
  const stage = resolveCardStage({ detectedItemDetails: deduped, infoSlots, recommendedNextAction });
  const nextSlot = stage === "planned" ? null : chooseNextSlotToAsk(infoSlots);
  const stageLine = nextSlot
    ? "확인해 두면 좋은 게 하나 있긴 한데, 답하지 않고 그냥 시작해도 괜찮아요."
    : "바로 시작할 수 있는 단계예요.";

  // The rest is parked, not dropped: name the remaining items and defer the
  // decision to the next execution unit.
  const remainingLabels = deduped.filter((item) => item.label !== chosen.label).map((item) => item.label);
  const holdLine =
    remainingLabels.length > 0 ? `나머지(${remainingLabels.join(", ")})는 버리는 게 아니라 보류예요 — 이 작업이 끝난 뒤에 다시 볼게요.` : "";

  const userFacingResponse = [focusLine, reasonLine, stageLine, holdLine].filter(Boolean).join(" ");

  return { userFacingResponse, recommendedNextAction, followUpQuestions: nextSlot ? [nextSlot.question] : [] };
}
