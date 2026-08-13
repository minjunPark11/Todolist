// Lite retrieval: no index, no embeddings. Ranks vault files by a cheap
// two-stage keyword match and appends whole files (in ranked order) into the
// knowledge budget. See KNOWLEDGE_BASE_DESIGN.md §3.1, §4.8.
import { platform } from "../../platform";
import type { PlatformFileEntry } from "../../platform/types";
import { assembleKnowledgeContext } from "./contextFormat";
import { parseMarkdownNote } from "./markdownParser";
import { scanVault } from "./obsidianScanner";
import type { KnowledgeContextResult, KnowledgeContextSource, KnowledgeSettings } from "./types";

// "제한 적용 (기본: 최대 50파일 · 파일당 256KB)" — §3.1. The same cap also
// bounds how many files stage 2 reads, so "상위 후보 파일만 read" (never the
// whole vault) falls out of this single constant.
const MAX_CANDIDATE_FILES = 50;
const MAX_FILE_BYTES = 256 * 1024;

const FILENAME_MATCH_WEIGHT = 10;
const HEADING_MATCH_WEIGHT = 5;
const TAG_OR_ALIAS_MATCH_WEIGHT = 8;
const PRIORITY_FOLDER_BONUS = 3;

function extractKeywords(query: string): string[] {
  const matches = query.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return Array.from(new Set(matches.map((word) => word.toLowerCase())));
}

function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function isUnderPriorityFolder(relativePath: string, priorityFolders: string[]): boolean {
  if (!priorityFolders.length) return false;
  const normalizedPath = relativePath.replace(/\\/g, "/");
  return priorityFolders.some((folder) => {
    const prefix = normalizeFolder(folder);
    return prefix.length > 0 && normalizedPath.startsWith(`${prefix}/`);
  });
}

function scoreFilename(relativePath: string, keywords: string[]): number {
  const lower = relativePath.toLowerCase();
  return keywords.reduce((score, keyword) => (lower.includes(keyword) ? score + FILENAME_MATCH_WEIGHT : score), 0);
}

function scoreParsedNote(note: ReturnType<typeof parseMarkdownNote>, keywords: string[]): number {
  const headingText = note.headings.map((heading) => heading.text.toLowerCase()).join(" ");
  const lowerTags = note.tags.map((tag) => tag.toLowerCase());
  const lowerAliases = note.aliases.map((alias) => alias.toLowerCase());

  let score = 0;
  for (const keyword of keywords) {
    if (headingText.includes(keyword)) score += HEADING_MATCH_WEIGHT;
    if (lowerTags.includes(keyword)) score += TAG_OR_ALIAS_MATCH_WEIGHT;
    if (lowerAliases.includes(keyword)) score += TAG_OR_ALIAS_MATCH_WEIGHT;
  }
  return score;
}

type ReadCandidate = {
  entry: PlatformFileEntry;
  content: string;
  headingPath: string;
  score: number;
};

export function createLiteFolderContextSource(getSettings: () => KnowledgeSettings): KnowledgeContextSource {
  return {
    async isReady() {
      const settings = getSettings();
      return Boolean(settings.enabled && settings.vaultPath && platform.files.supported());
    },

    async buildContext(query, budgetChars): Promise<KnowledgeContextResult | null> {
      const settings = getSettings();
      if (!settings.enabled || !settings.vaultPath || !platform.files.supported()) return null;

      let entries: PlatformFileEntry[];
      try {
        entries = await scanVault(settings.vaultPath, settings.excludedFolders);
      } catch {
        return null;
      }
      if (!entries.length) return null;

      const keywords = extractKeywords(query);

      // Stage 1: filename-only score from scan metadata (no reads yet).
      const stage1 = entries
        .map((entry) => ({
          entry,
          score:
            scoreFilename(entry.relativePath, keywords) +
            (isUnderPriorityFolder(entry.relativePath, settings.priorityFolders) ? PRIORITY_FOLDER_BONUS : 0),
        }))
        .sort((a, b) => b.score - a.score || b.entry.modifiedAt - a.entry.modifiedAt)
        .slice(0, Math.min(MAX_CANDIDATE_FILES, entries.length));

      // Stage 2: read only the stage-1 candidates, add heading/tag/alias bonus.
      const candidates: ReadCandidate[] = [];
      for (const candidate of stage1) {
        if (candidate.entry.size > MAX_FILE_BYTES) continue;
        try {
          const content = await platform.files.readTextFile(candidate.entry.path, MAX_FILE_BYTES);
          const note = parseMarkdownNote(content);
          candidates.push({
            entry: candidate.entry,
            content,
            headingPath: note.headings[0]?.text ?? "",
            score: candidate.score + scoreParsedNote(note, keywords),
          });
        } catch {
          continue;
        }
      }
      if (!candidates.length) return null;

      candidates.sort((a, b) => b.score - a.score || b.entry.modifiedAt - a.entry.modifiedAt);

      return assembleKnowledgeContext(
        candidates.map((candidate) => ({
          filePath: candidate.entry.relativePath,
          headingPath: candidate.headingPath,
          text: candidate.content,
          score: candidate.score,
        })),
        budgetChars,
      );
    },
  };
}
