// Shared [KNOWLEDGE] block assembly for Lite and Full retrieval — both
// implementations hand this a pre-ranked candidate list and get back the
// identical block format, so swapping Lite for RAG is prompt-invisible
// (KNOWLEDGE_BASE_DESIGN.md §6 item 4).
import type { KnowledgeContextResult, RetrievedChunk } from "./types";

export const KNOWLEDGE_BLOCK_HEADER = "[KNOWLEDGE from Obsidian vault — read-only excerpts]";
export const KNOWLEDGE_BLOCK_INSTRUCTIONS = "Instructions: cite the source path when you use these excerpts.";
export const KNOWLEDGE_BLOCK_TRUNCATED = "[knowledge truncated]";

export function formatSourceBlock(filePath: string, headingPath: string, text: string): string {
  const sourceLabel = headingPath ? `${filePath} # ${headingPath}` : filePath;
  return `── source: ${sourceLabel}\n${text}`;
}

export interface RankedCandidate {
  filePath: string;
  headingPath: string;
  text: string;
  score: number;
}

// Appends ranked candidates (already sorted best-first) until the budget is
// used up. A candidate that doesn't fully fit gets truncated in place and
// ends the loop — lower-ranked candidates are dropped, matching design §6
// item 3 ("score 낮은 chunk부터 탈락").
export function assembleKnowledgeContext(candidates: RankedCandidate[], budgetChars: number): KnowledgeContextResult | null {
  const blocks: string[] = [];
  const sources: RetrievedChunk[] = [];
  let used = 0;
  let truncated = false;

  for (const candidate of candidates) {
    const remaining = budgetChars - used;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const overhead = formatSourceBlock(candidate.filePath, candidate.headingPath, "").length;
    const available = remaining - overhead;
    if (available <= 0) {
      truncated = true;
      break;
    }

    const fitsFully = candidate.text.length <= available;
    const text = fitsFully ? candidate.text : candidate.text.slice(0, available);
    if (!fitsFully) truncated = true;

    blocks.push(formatSourceBlock(candidate.filePath, candidate.headingPath, text));
    sources.push({ text, filePath: candidate.filePath, headingPath: candidate.headingPath, score: candidate.score });
    used += overhead + text.length;

    if (!fitsFully) break;
  }

  if (!blocks.length) return null;

  const footer = truncated ? `${KNOWLEDGE_BLOCK_TRUNCATED}\n${KNOWLEDGE_BLOCK_INSTRUCTIONS}` : KNOWLEDGE_BLOCK_INSTRUCTIONS;

  return {
    text: [KNOWLEDGE_BLOCK_HEADER, ...blocks, footer].join("\n"),
    sources,
  };
}
