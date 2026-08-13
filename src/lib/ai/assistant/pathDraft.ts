// Deterministic gate + repair layer for Learning Path proposals (Path slice
// A of the stuck-to-execution vision). Same philosophy as infoSlots.ts and
// planSteps.ts: the model proposes a learning_path via prompts.ts, these
// pure functions decide whether the user actually asked for one and repair
// or drop what arrived. The model alone can never surface a path — the
// trigger below runs on the user's raw input, not on model output.
import type { LearningPathDraft, Milestone } from "../learningPaths/types";
import { isObservableOutput } from "./overwhelmHeuristics";

export const MIN_PATH_MILESTONES = 3;
export const MAX_PATH_MILESTONES = 5;

// Path nouns: the user names the thing they want built. "경로" alone is
// deliberately excluded ("경로가 안 보여" is a complaint, not a request) —
// the noun must be a construct word or a decomposition phrase.
const PATH_NOUN_PATTERN =
  /(학습\s*경로|커리큘럼|로드맵|학습\s*계획|단계(별)?로\s*(나눠|나누|쪼개|짜|정리)|curriculum|road\s?map|learning\s+path|study\s+plan|break\s+(it|this|.{1,30})\s+into\s+(steps|stages|milestones))/i;

// Request verbs: the user asks for it to be made, not merely mentions it.
const REQUEST_VERB_PATTERN =
  /(만들|짜|세워|나눠|나누|쪼개|설계|잡아|정리해|그려|추천해|제안해|알려|\bmake\b|\bcreate\b|\bbuild\b|\bplan\b|\bdesign\b|\bsuggest\b|\bdraw\b)/i;

// Explicit-request trigger (decision 2026-07-09): a path draft may only
// surface on turns where the user directly asks for a path/curriculum/stage
// breakdown. Ordinary overwhelm dumps and "뭐부터 해야 해?" turns must never
// fire this — the existing fallback flow stays untouched for those.
export function looksLikeLearningPathRequest(text: string): boolean {
  return PATH_NOUN_PATTERN.test(text) && REQUEST_VERB_PATTERN.test(text);
}

export type RawMilestoneProposal = {
  title: string;
  doneCriteria: string;
};

// Repair, not gate (assumed_default philosophy): an unobservable done
// criteria gets a safe deterministic default instead of dropping the
// milestone or blocking the proposal.
function repairedDoneCriteria(title: string, doneCriteria: string): string {
  return isObservableOutput(doneCriteria) ? doneCriteria.trim() : `「${title}」의 산출물 1개가 남아 있는 상태`;
}

// Validates and repairs the model's milestone list into a saveable draft.
// Returns null (no proposal this turn — the normal flow continues) only when
// the goal is missing or fewer than MIN_PATH_MILESTONES usable milestones
// survive; everything else is repaired or clamped.
export function resolveLearningPathDraft(goal: string, rawMilestones: RawMilestoneProposal[]): LearningPathDraft | null {
  const trimmedGoal = goal.trim();
  if (!trimmedGoal) return null;

  const seenTitles = new Set<string>();
  const milestones: Milestone[] = [];
  for (const raw of rawMilestones) {
    const title = raw.title.trim();
    if (!title) continue;
    const titleKey = title.toLowerCase();
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);
    milestones.push({
      id: `ms-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title,
      doneCriteria: repairedDoneCriteria(title, raw.doneCriteria),
      cardIds: [],
    });
    if (milestones.length === MAX_PATH_MILESTONES) break;
  }

  if (milestones.length < MIN_PATH_MILESTONES) return null;
  return { goal: trimmedGoal, milestones };
}
