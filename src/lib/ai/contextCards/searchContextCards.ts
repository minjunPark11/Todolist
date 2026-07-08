// Related-card lookup for assistant turns. MVP relevance is keyword overlap
// scoring — this module is the function boundary to swap for vector search
// later (same signature, different ranking) without touching the assistant
// loop or UI.
import type { ContextCard } from "./types";

// Tokens the matcher considers meaningful: 2+ chars, lowercased, split on
// anything that isn't a letter/digit (works for Korean, which has no case).
export function extractKeywords(text: string, maxTokens = 24): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens)].slice(0, maxTokens);
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
  const lines = [
    `[Context card ${card.id}] ${card.title} (updated ${card.updatedAt.slice(0, 10)})`,
    card.detectedItems.length ? `items: ${joinCapped(card.detectedItems)}` : "",
    card.currentStatus.length ? `status: ${joinCapped(card.currentStatus)}` : "",
    card.likelyBlockers.length ? `blockers: ${joinCapped(card.likelyBlockers)}` : "",
    card.missingInfo.length ? `still unknown: ${joinCapped(card.missingInfo)}` : "",
    card.recommendedNextAction ? `last recommended next action: ${card.recommendedNextAction.title}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
