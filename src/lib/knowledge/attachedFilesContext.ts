// Phase 4: per-message file attachment. Separate from automatic retrieval
// (Lite/Full) — the user explicitly picked these files, so they are always
// included rather than ranked/filtered, consuming the knowledge budget
// before automatic retrieval gets whatever remains.
import { platform } from "../../platform";
import { ATTACHED_FILES_HEADER, assembleKnowledgeContext, type RankedCandidate } from "./contextFormat";
import type { KnowledgeContextResult } from "./types";

// Same per-file cap as Lite's stage-2 reads, for consistency.
const MAX_ATTACHED_FILE_BYTES = 256 * 1024;

export interface AttachedFileRef {
  path: string;
  relativePath: string;
}

export async function buildAttachedFilesContext(
  files: AttachedFileRef[],
  budgetChars: number,
): Promise<KnowledgeContextResult | null> {
  if (!files.length) return null;

  const candidates: RankedCandidate[] = [];
  for (const file of files) {
    try {
      const content = await platform.files.readTextFile(file.path, MAX_ATTACHED_FILE_BYTES);
      candidates.push({ filePath: file.relativePath, headingPath: "", text: content, score: Number.POSITIVE_INFINITY });
    } catch {
      // Unreadable/too-large attachment — skip it rather than fail the message.
      continue;
    }
  }
  if (!candidates.length) return null;

  return assembleKnowledgeContext(candidates, budgetChars, ATTACHED_FILES_HEADER);
}
