import { useEffect, useState } from "react";
import {
  DEFAULT_OVERVIEW_CARDS,
  DEFAULT_SPACE_DEFAULTS,
  emptySpaceConfig,
  type SpaceActivity,
  type SpaceCustomConfig,
  type SpaceNote,
} from "../lib/spaceHubTypes";

// Notes, manual activity records, and per-space customization live in their
// own localStorage bucket so the core planner data shape stays untouched.
const STORAGE_KEY = "todo-planner-space-hub-v1";

interface SpaceHubStore {
  notes: SpaceNote[];
  activities: SpaceActivity[];
  configs: SpaceCustomConfig[];
}

function loadStore(): SpaceHubStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  const [store, setStore] = useState<SpaceHubStore>(loadStore);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // localStorage full/unavailable: keep in-memory state working.
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

  function addActivity(
    spaceId: string,
    input: Pick<SpaceActivity, "type" | "title"> & Partial<Pick<SpaceActivity, "description" | "relatedTaskId" | "relatedSessionId" | "relatedNoteId">>,
  ) {
    const activity: SpaceActivity = {
      id: createId("sact"),
      spaceId,
      type: input.type,
      title: input.title,
      description: input.description ?? "",
      relatedTaskId: input.relatedTaskId ?? "",
      relatedSessionId: input.relatedSessionId ?? "",
      relatedNoteId: input.relatedNoteId ?? "",
      createdAt: new Date().toISOString(),
    };
    setStore((current) => ({ ...current, activities: [activity, ...current.activities].slice(0, 500) }));
  }

  function getConfig(spaceId: string): SpaceCustomConfig {
    const stored = store.configs.find((config) => config.spaceId === spaceId);
    if (!stored) return emptySpaceConfig(spaceId);
    return {
      ...stored,
      overviewCards: { ...DEFAULT_OVERVIEW_CARDS, ...stored.overviewCards },
      defaults: { ...DEFAULT_SPACE_DEFAULTS, ...stored.defaults },
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
    addActivity,
    getConfig,
    updateConfig,
  };
}

export type SpaceHubData = ReturnType<typeof useSpaceHubData>;
