// Related-card lookup for assistant turns. MVP relevance is keyword overlap
// scoring — this module is the function boundary to swap for vector search
// later (same signature, different ranking) without touching the assistant
// loop or UI.
import type { ContextCard } from "./types";

// Filler tokens that would otherwise match almost any Korean/English brain
// dump ("해야", "하고", ...) and drag unrelated records into the context pack.
const STOPWORDS = new Set([
  "해야", "하고", "하는데", "해서", "그리고", "그래서", "근데", "그런데", "뭐부터", "먼저",
  "모르겠어", "모르겠다", "있는데", "싶은데", "같아", "너무", "진짜", "정말", "지금", "오늘",
  "the", "and", "but", "for", "with", "have", "has", "need", "want", "know", "what",
  "should", "must", "also", "then", "that", "this", "don", "dont",
]);

// Common single/double-char Korean particles; stripping them lets "졸업논문도"
// match records that say "졸업논문".
const PARTICLES_1 = ["도", "은", "는", "이", "가", "을", "를", "만", "의", "에", "나", "랑", "와", "과"];
const PARTICLES_2 = ["으로", "부터", "까지", "에서", "이나", "처럼", "보다", "에게", "한테", "이랑"];

function stripParticle(token: string): string | null {
  for (const particle of PARTICLES_2) {
    if (token.length >= 4 && token.endsWith(particle)) return token.slice(0, -2);
  }
  for (const particle of PARTICLES_1) {
    if (token.length >= 3 && token.endsWith(particle)) return token.slice(0, -1);
  }
  return null;
}

// Tokens the matcher considers meaningful: 2+ chars, lowercased, split on
// anything that isn't a letter/digit (works for Korean, which has no case).
// Each token is also emitted with a trailing particle stripped, and filler
// words are dropped.
export function extractKeywords(text: string, maxTokens = 24): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  const withStripped = tokens.flatMap((token) => {
    const stripped = stripParticle(token);
    return stripped && stripped.length >= 2 && !STOPWORDS.has(stripped) ? [token, stripped] : [token];
  });
  return [...new Set(withStripped)].slice(0, maxTokens);
}

function cardSearchText(card: ContextCard): string {
  return [
    card.title,
    card.rawInput,
    ...card.detectedItems,
    ...card.inferredDomains,
    ...card.workTypes,
    ...card.possibleOutputs,
  ]
    .join(" ")
    .toLowerCase();
}

// Cards ranked by keyword overlap with the query; ties broken by recency.
// Returns [] rather than weak matches — a card must share at least one token.
export function findRelatedContextCards(query: string, cards: ContextCard[], limit = 3): ContextCard[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  return cards
    .map((card) => {
      const haystack = cardSearchText(card);
      const score = keywords.reduce((total, keyword) => (haystack.includes(keyword) ? total + 1 : total), 0);
      return { card, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.card.updatedAt.localeCompare(a.card.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.card);
}

function joinCapped(values: string[], max = 4): string {
  return values.slice(0, max).join("; ");
}

// Compact single-card summary for the AI prompt — related cards go in
// summarized (never the full card set, never full raw inputs).
export function summarizeContextCardForPrompt(card: ContextCard): string {
  const slots = card.infoSlots ?? [];
  const answeredSlots = slots.filter((slot) => slot.answer.trim() !== "");
  const openSlots = slots.filter((slot) => slot.answer.trim() === "");
  const lines = [
    `[Context card ${card.id}] ${card.title} (updated ${card.updatedAt.slice(0, 10)})`,
    card.stage ? `stage: ${card.stage}` : "",
    card.detectedItems.length ? `items: ${joinCapped(card.detectedItems)}` : "",
    card.currentStatus.length ? `status: ${joinCapped(card.currentStatus)}` : "",
    card.likelyBlockers.length ? `blockers: ${joinCapped(card.likelyBlockers)}` : "",
    card.missingInfo.length ? `still unknown: ${joinCapped(card.missingInfo)}` : "",
    answeredSlots.length
      ? `answered info slots (do not re-ask): ${joinCapped(answeredSlots.map((slot) => `${slot.kind}=${slot.answer}`), 6)}`
      : "",
    openSlots.length ? `open info slots: ${joinCapped(openSlots.map((slot) => slot.kind), 6)}` : "",
    card.recommendedNextAction ? `last recommended next action: ${card.recommendedNextAction.title}` : "",
    card.plan?.length ? `existing plan (refine, do not restart): ${joinCapped(card.plan.map((step) => step.title), 4)}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
