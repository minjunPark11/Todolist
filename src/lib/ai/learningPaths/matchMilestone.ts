// Deterministic milestone suggestion for card→path linking (Path slice B).
// Same contract as progress.ts: the model never decides which milestone a
// card belongs to — token overlap against milestone titles does, and the
// user confirms every link with an explicit click in the panel (decision
// 2026-07-09: suggest + one-click confirm, never auto-link).
import type { ContextCard } from "../contextCards/types";
import { currentMilestoneIndex } from "./progress";
import type { LearningPath, Milestone } from "./types";

export type MilestoneSuggestion = {
  milestone: Milestone;
  index: number;
  // true when title-token overlap picked this milestone; false when nothing
  // overlapped and we fell back to the path's current milestone.
  matched: boolean;
};

type CardLike = Pick<ContextCard, "title" | "detectedItems" | "inferredDomains">;

// Tokens of length >= 2 so single letters/jamo don't produce noise matches.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

// Best-overlap milestone for a card, ties broken by path order (earlier
// milestone wins — the path progresses by index). Zero overlap falls back to
// the current milestone so the panel can always offer a sensible default.
export function suggestMilestoneForCard(path: LearningPath, card: CardLike, cards: ContextCard[]): MilestoneSuggestion | null {
  if (path.milestones.length === 0) return null;
  const cardText = [card.title, ...card.detectedItems, ...card.inferredDomains].join(" ").toLowerCase();

  let bestIndex = -1;
  let bestScore = 0;
  path.milestones.forEach((milestone, index) => {
    const score = tokenize(milestone.title).filter((token) => cardText.includes(token)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex >= 0) {
    return { milestone: path.milestones[bestIndex], index: bestIndex, matched: true };
  }
  const fallbackIndex = currentMilestoneIndex(path, cards);
  return { milestone: path.milestones[fallbackIndex], index: fallbackIndex, matched: false };
}
