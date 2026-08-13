// Deterministic memory → context block (User Patterns slice C.1). Turns the
// approved AiMemory entries into a small, capped profile the assistant reads
// each turn. Pure function: no model, no I/O. The caller (context pack) is
// responsible for keeping it on the local-only channel — this text is highly
// personal and must never reach a non-local provider.
import type { AiMemoryEntry, AiMemoryKind } from "./types";

// Hard cap so the block never eats into the prompt budget (promptBudget.ts):
// the assistant already carries a large system prompt + app-data pack.
export const MEMORY_PROFILE_MAX_CHARS = 500;

// Only reasonably-confident memories are surfaced to the model; freshly
// proposed/low-confidence ones (slice C.2) stay out until reconfirmed.
export const MEMORY_PROFILE_MIN_CONFIDENCE = 0.4;

// Human-readable, model-facing labels per kind. Kept plain so the block reads
// as neutral observed facts, never as a psychological profile.
const KIND_LABEL: Record<AiMemoryKind, string> = {
  preference: "선호",
  routine: "패턴",
  fact: "사실",
  intervention_outcome: "이전 결과",
};

// Highest-confidence first, then newest — the order the block lists them in
// and the order it drops from when the char cap is hit.
function rank(a: AiMemoryEntry, b: AiMemoryEntry): number {
  return b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt);
}

// Builds the profile block, or undefined when nothing qualifies. Greedily
// packs the highest-ranked memories that fit under MEMORY_PROFILE_MAX_CHARS
// (measured on the whole block, header included).
export function buildMemoryProfileBlock(
  memories: AiMemoryEntry[],
  maxChars = MEMORY_PROFILE_MAX_CHARS,
): string | undefined {
  const eligible = memories
    .filter((entry) => entry.confidence >= MEMORY_PROFILE_MIN_CONFIDENCE && entry.content.trim())
    .sort(rank);
  if (eligible.length === 0) return undefined;

  const header =
    "What the assistant has learned about this user (user-approved; observed behavior only, treat as background — never diagnose the user):";
  const lines: string[] = [];
  let length = header.length;
  for (const entry of eligible) {
    const line = `- [${KIND_LABEL[entry.kind]}] ${entry.content.trim()}`;
    // +1 for the newline that joins this line to the block.
    if (length + line.length + 1 > maxChars) break;
    lines.push(line);
    length += line.length + 1;
  }

  if (lines.length === 0) return undefined;
  return [header, ...lines].join("\n");
}
