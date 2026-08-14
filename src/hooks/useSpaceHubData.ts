import { useEffect, useState } from "react";
import { pushUndo } from "../lib/undoStack";
import { platform } from "../platform";
import {
  DEFAULT_OVERVIEW_CARDS,
  DEFAULT_SPACE_DEFAULTS,
  emptySpaceConfig,
  type SpaceActivity,
  type SpaceCustomConfig,
  type SpaceNote,
} from "../lib/spaceHubTypes";

// Notes, legacy activity records, and lightweight per-space preferences live
// in their own platform storage bucket so the core planner data stays small.
const STORAGE_KEY = "todo-planner-space-hub-v1";

interface SpaceHubStore {
  notes: SpaceNote[];
  activities: SpaceActivity[];
  configs: SpaceCustomConfig[];
}

function loadStore(): SpaceHubStore {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return { notes: [], activities: [], configs: [] };
    const parsed = JSON.parse(raw) as Partial<SpaceHubStore>;
    return {
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      configs: Array.isArray(parsed.configs) ? parsed.configs : [],
    };
  } catch {
    return { notes: [], activities: [], configs: [] };
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface SpaceNoteDraft {
  title: string;
  body?: string;
  type?: string;
  url?: string;
  relatedTaskId?: string;
  tags?: string[];
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
      setStoreState({ notes: [], activities: [], configs: [] });
    }
    window.addEventListener("focusflow:space-hub-reset", resetSpaceHubStore);
    return () => window.removeEventListener("focusflow:space-hub-reset", resetSpaceHubStore);
  }, []);

  useEffect(() => {
    try {
      platform.storage.setSync(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Storage full/unavailable: keep in-memory state working.
    }
  }, [store]);

  function addNote(spaceId: string, draft: SpaceNoteDraft): string {
    const now = new Date().toISOString();
    const note: SpaceNote = {
      id: createId("snote"),
      spaceId,
      title: draft.title.trim(),
      body: draft.body?.trim() ?? "",
      type: draft.type ?? "Quick Note",
      url: draft.url?.trim() ?? "",
      relatedTaskId: draft.relatedTaskId ?? "",
      tags: draft.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    setStore((current) => ({ ...current, notes: [note, ...current.notes] }));
    return note.id;
  }

  function updateNote(noteId: string, patch: Partial<SpaceNote>) {
    const now = new Date().toISOString();
    setStore((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === noteId ? { ...note, ...patch, updatedAt: now } : note)),
    }));
  }

  function deleteNote(noteId: string) {
    setStore((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== noteId) }));
  }

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
    notes: store.notes,
    activities: store.activities,
    addNote,
    updateNote,
    deleteNote,
    getConfig,
    updateConfig,
  };
}

export type SpaceHubData = ReturnType<typeof useSpaceHubData>;
