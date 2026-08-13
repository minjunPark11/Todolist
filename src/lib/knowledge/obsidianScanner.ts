// Thin wrapper over platform.files.scanMarkdownFiles with the extension
// whitelist and a short session cache, per KNOWLEDGE_BASE_DESIGN.md §3.1:
// "Lite는 색인·DB가 없다. 매 질문마다 읽되, 스캔 결과를 세션 메모리에 짧게
// (TTL 30s) 캐시해 연타 질문의 중복 I/O를 줄인다."
import { platform } from "../../platform";
import type { PlatformFileEntry } from "../../platform/types";

const SCAN_EXTENSIONS = [".md", ".markdown", ".txt"];
const SCAN_CACHE_TTL_MS = 30_000;
// Safety cap on how many files a single scan walks, independent of the
// selection-stage MAX_CANDIDATE_FILES cap in liteContextSource.
const MAX_SCAN_FILES = 5000;

type ScanCache = {
  vaultPath: string;
  excludedFolders: string;
  entries: PlatformFileEntry[];
  expiresAt: number;
};

let cache: ScanCache | null = null;

export async function scanVault(vaultPath: string, excludedFolders: string[]): Promise<PlatformFileEntry[]> {
  const excludedKey = [...excludedFolders].sort().join("|");
  const now = Date.now();

  if (cache && cache.vaultPath === vaultPath && cache.excludedFolders === excludedKey && cache.expiresAt > now) {
    return cache.entries;
  }

  const entries = await platform.files.scanMarkdownFiles(vaultPath, {
    extensions: SCAN_EXTENSIONS,
    excludedFolders,
    maxFiles: MAX_SCAN_FILES,
  });

  cache = { vaultPath, excludedFolders: excludedKey, entries, expiresAt: now + SCAN_CACHE_TTL_MS };
  return entries;
}

export function clearVaultScanCache() {
  cache = null;
}
