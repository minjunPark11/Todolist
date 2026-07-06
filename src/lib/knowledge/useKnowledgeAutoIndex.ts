// Phase 4: "앱 시작 자동 확인" (run once when Full mode becomes active) plus
// file watch (re-run incremental indexing after debounced vault changes) —
// see KNOWLEDGE_BASE_DESIGN.md §11 decision #3. Silent/best-effort: failures
// surface next time the user opens Settings and clicks "Index now" manually,
// matching §9's "hash 비교로 다음 증분에서 자연 수복" self-healing approach.
import { useEffect, useRef } from "react";
import { platform } from "../../platform";
import { runIndexing, type RunIndexOptions, type RunIndexResult } from "./indexer";
import { KnowledgeStore } from "./knowledgeStore";
import type { KnowledgeSettings } from "./types";

export interface AutoIndexDeps {
  openStore: (dbPath: string) => Promise<{ close: () => Promise<void> }>;
  runIndex: (store: { close: () => Promise<void> }, options: RunIndexOptions) => Promise<RunIndexResult>;
  watchVault: (path: string, onChange: () => void) => Promise<() => void>;
}

const defaultDeps: AutoIndexDeps = {
  openStore: (dbPath) => KnowledgeStore.open(dbPath),
  runIndex: (store, options) => runIndexing(store as KnowledgeStore, options),
  watchVault: (path, onChange) => platform.files.watchVault(path, onChange),
};

// Pure orchestration (no React), so it can be driven directly in tests
// without a React runtime — see useKnowledgeAutoIndex below for the hook
// wrapper actually used by the app.
export function startKnowledgeAutoIndex(
  settings: KnowledgeSettings,
  isRunningRef: { current: boolean },
  deps: AutoIndexDeps = defaultDeps,
): () => void {
  const active =
    settings.enabled && settings.indexingMode === "full" && Boolean(settings.vaultPath) && platform.files.supported();
  if (!active) return () => undefined;

  let cancelled = false;
  let unwatch: (() => void) | null = null;

  async function runOnce() {
    // Skip if a previous run (initial check or an earlier watch event) is
    // still in flight, rather than stacking overlapping indexing passes.
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    let store: { close: () => Promise<void> } | null = null;
    try {
      store = await deps.openStore(settings.dbPath);
      await deps.runIndex(store, {
        vaultPath: settings.vaultPath,
        excludedFolders: settings.excludedFolders,
        embeddingModel: settings.embeddingModel,
      });
    } catch {
      // Best-effort background sync — no user-facing error surface here.
    } finally {
      if (store) await store.close().catch(() => undefined);
      isRunningRef.current = false;
    }
  }

  void (async () => {
    await runOnce();
    if (cancelled) return;

    try {
      const stop = await deps.watchVault(settings.vaultPath, () => {
        void runOnce();
      });
      if (cancelled) {
        // Settings changed while watchVault() was still registering —
        // stop it immediately so it doesn't outlive this effect.
        stop();
        return;
      }
      unwatch = stop;
    } catch {
      // Watching unavailable — the manual "Index now" button still works.
    }
  })();

  return () => {
    cancelled = true;
    unwatch?.();
  };
}

export function useKnowledgeAutoIndex(settings: KnowledgeSettings) {
  const isRunningRef = useRef(false);

  useEffect(
    () => startKnowledgeAutoIndex(settings, isRunningRef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      settings.enabled,
      settings.indexingMode,
      settings.vaultPath,
      settings.dbPath,
      settings.embeddingModel,
      settings.excludedFolders,
    ],
  );
}
