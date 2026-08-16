import { useEffect, useState } from "react";
import { pushUndo } from "../lib/undoStack";
import { platform } from "../platform";
import {
  DEFAULT_OVERVIEW_CARDS,
  DEFAULT_SPACE_DEFAULTS,
  emptySpaceConfig,
  type SpaceActivity,
  type SpaceCustomConfig,
} from "../lib/spaceHubTypes";

// Legacy activity records and lightweight per-space preferences live in their
// own platform storage bucket so the core planner data stays small.
//
// Notes used to live here too. They are user *writing*, so they moved into the
// synced dataset (usePlannerData, SPACES_CLICKUP_REDESIGN.md M1) — this hook no
// longer reads or edits them.
const STORAGE_KEY = "todo-planner-space-hub-v1";

interface SpaceHubStore {
  // Carried verbatim, never parsed or edited. The migration drains this key
  // (legacySpaceNotes.ts) and only marks itself done once the planner data has
  // been persisted, so dropping it here would destroy the notes of anyone whose
  // first launch after the update failed to write. It costs one untouched key
  // to keep the old copy recoverable by hand for a release.
  legacyNotes: unknown;
  activities: SpaceActivity[];
  configs: SpaceCustomConfig[];
}

function emptyStore(): SpaceHubStore {
  return { legacyNotes: undefined, activities: [], configs: [] };
}

/**
 * Records here were keyed by the Spaces screen's derived card id, which used
 * to carry a `project-space-` prefix the rest of the app never used
 * (SPACES_REDESIGN_II §0.3.8). Now that a space IS its Project, the stored keys
 * are normalised on load rather than looked up through a permanent fallback —
 * a fallback would have to answer for every read forever, and this blob is
 * device-local, so rewriting it costs one localStorage write and no sync.
 */
const LEGACY_SPACE_ID_PREFIX = "project-space-";

function normalizeSpaceId(spaceId: string): string {
  return spaceId.startsWith(LEGACY_SPACE_ID_PREFIX)
    ? spaceId.slice(LEGACY_SPACE_ID_PREFIX.length)
    : spaceId;
}

function loadStore(): SpaceHubStore {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<SpaceHubStore> & { notes?: unknown };
    const configs = Array.isArray(parsed.configs) ? parsed.configs : [];
    const seen = new Set<string>();
    return {
      legacyNotes: parsed.notes,
      activities: (Array.isArray(parsed.activities) ? parsed.activities : []).map((activity) => ({
        ...activity,
        spaceId: normalizeSpaceId(activity.spaceId),
      })),
      // `updateConfig` prepends, so the first entry for an id is the newest.
      // Two entries can only collide if one was written before the prefix
      // existed; keeping the newer one is the same rule a write would apply.
      configs: configs.reduce<SpaceCustomConfig[]>((kept, config) => {
        const spaceId = normalizeSpaceId(config.spaceId);
        if (seen.has(spaceId)) return kept;
        seen.add(spaceId);
        kept.push({ ...config, spaceId });
        return kept;
      }, []),
    };
  } catch {
    return emptyStore();
  }
}

/** Written back under the original `notes` key so the blob keeps its shape. */
function serializeStore(store: SpaceHubStore): string {
  const { legacyNotes, ...rest } = store;
  return JSON.stringify(legacyNotes === undefined ? rest : { ...rest, notes: legacyNotes });
}

export function useSpaceHubData() {
  const [store, setStoreState] = useState<SpaceHubStore>(loadStore);

  // User edits record an undo snapshot; the reset event below bypasses it.
  function setStore(updater: (current: SpaceHubStore) => SpaceHubStore) {
    setStoreState((current) => {
      const next = updater(current);
      if (next !== current) pushUndo(() => setStoreState(current));
      return next;
    });
  }

  useEffect(() => {
    function resetSpaceHubStore() {
      // A full reset drops the legacy copy too — the user asked for their data
      // to be gone, and by then the notes live in the planner dataset.
      setStoreState(emptyStore());
    }
    window.addEventListener("focusflow:space-hub-reset", resetSpaceHubStore);
    return () => window.removeEventListener("focusflow:space-hub-reset", resetSpaceHubStore);
  }, []);

  useEffect(() => {
    try {
      platform.storage.setSync(STORAGE_KEY, serializeStore(store));
    } catch {
      // Storage full/unavailable: keep in-memory state working.
    }
  }, [store]);

  function getConfig(spaceId: string): SpaceCustomConfig {
    const stored = store.configs.find((config) => config.spaceId === spaceId);
    if (!stored) return emptySpaceConfig(spaceId);
    return {
      spaceId,
      overviewCards: { ...DEFAULT_OVERVIEW_CARDS, ...stored.overviewCards },
      defaults: { ...DEFAULT_SPACE_DEFAULTS, ...stored.defaults },
      pinnedNextActionTaskId: stored.pinnedNextActionTaskId,
      updatedAt: stored.updatedAt,
    };
  }

  function updateConfig(spaceId: string, patch: Partial<SpaceCustomConfig>) {
    setStore((current) => {
      const existing = current.configs.find((config) => config.spaceId === spaceId) ?? emptySpaceConfig(spaceId);
      const next: SpaceCustomConfig = {
        ...existing,
        ...patch,
        overviewCards: { ...existing.overviewCards, ...patch.overviewCards },
        defaults: { ...existing.defaults, ...patch.defaults },
        spaceId,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...current,
        configs: [next, ...current.configs.filter((config) => config.spaceId !== spaceId)],
      };
    });
  }

  return {
    activities: store.activities,
    getConfig,
    updateConfig,
  };
}

export type SpaceHubData = ReturnType<typeof useSpaceHubData>;
