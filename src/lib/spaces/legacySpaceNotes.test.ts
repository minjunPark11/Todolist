import { beforeEach, describe, expect, it, vi } from "vitest";

// The real adapter reaches for window.localStorage, which the node test
// environment does not have. A map stands in so the drain can be exercised.
const store = new Map<string, string>();
vi.mock("../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => void store.set(key, value),
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

import {
  LEGACY_SPACE_NOTES_KEY,
  LEGACY_SPACE_NOTES_MIGRATED_KEY,
  markLegacySpaceNotesMigrated,
  readLegacySpaceNotes,
} from "./legacySpaceNotes";

function seed(value: unknown) {
  store.set(LEGACY_SPACE_NOTES_KEY, JSON.stringify(value));
}

describe("readLegacySpaceNotes", () => {
  beforeEach(() => store.clear());

  it("drains the notes out of the space-hub blob", () => {
    seed({
      notes: [
        { id: "n1", spaceId: "s1", title: "Kickoff", body: "call Monday", updatedAt: "2026-08-01T00:00:00.000Z" },
      ],
      activities: [],
      configs: [],
    });
    expect(readLegacySpaceNotes()).toEqual([
      {
        id: "n1",
        spaceId: "s1",
        title: "Kickoff",
        body: "call Monday",
        type: "Quick Note",
        url: "",
        relatedTaskId: "",
        tags: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });

  it("ignores activities and configs — this drain only claims the notes", () => {
    seed({
      notes: [{ id: "n1", spaceId: "s1", title: "Keep" }],
      activities: [{ id: "a1", spaceId: "s1", type: "manual_record" }],
      configs: [{ spaceId: "s1" }],
    });
    expect(readLegacySpaceNotes().map((note) => note.id)).toEqual(["n1"]);
  });

  it("drops entries with no id or no space rather than importing an unreachable note", () => {
    seed({ notes: [{ id: "", spaceId: "s1" }, { id: "n2" }, null, "junk"] });
    expect(readLegacySpaceNotes()).toEqual([]);
  });

  it("returns nothing once the marker is set, so deletes cannot resurrect the blob", () => {
    seed({ notes: [{ id: "n1", spaceId: "s1", title: "Kickoff" }] });
    markLegacySpaceNotesMigrated();
    expect(store.get(LEGACY_SPACE_NOTES_MIGRATED_KEY)).toBe("1");
    expect(readLegacySpaceNotes()).toEqual([]);
  });

  it("survives a corrupt blob rather than failing the app load", () => {
    store.set(LEGACY_SPACE_NOTES_KEY, "{not json");
    expect(readLegacySpaceNotes()).toEqual([]);
  });

  it("survives a blob with no notes key at all", () => {
    seed({ activities: [], configs: [] });
    expect(readLegacySpaceNotes()).toEqual([]);
  });
});
