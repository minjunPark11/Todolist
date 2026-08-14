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
  LEGACY_LOCAL_SPACES_KEY,
  LEGACY_LOCAL_SPACES_MIGRATED_KEY,
  markLegacyLocalSpacesMigrated,
  readLegacyLocalSpaces,
} from "./legacyLocalSpaces";

function seed(value: unknown) {
  store.set(LEGACY_LOCAL_SPACES_KEY, JSON.stringify(value));
}

describe("readLegacyLocalSpaces", () => {
  beforeEach(() => store.clear());

  it("turns a custom space into an area project keeping its name and colour", () => {
    seed({ spaces: [{ id: "space-1", name: "Health", description: "Body upkeep", color: "#ff0000" }], pinnedIds: [] });
    const [project] = readLegacyLocalSpaces();
    expect(project).toMatchObject({
      id: "space-1",
      name: "Health",
      description: "Body upkeep",
      color: "#ff0000",
      type: "area",
      status: "active",
    });
  });

  it("carries the pin over, so a pin survives to another device", () => {
    seed({ spaces: [{ id: "space-1", name: "Health" }], pinnedIds: ["space-1"] });
    expect(readLegacyLocalSpaces()[0].pinned).toBe(true);
  });

  it("keeps the objective and any sections the user typed, in notes", () => {
    seed({
      spaces: [{ id: "space-1", name: "Health", objective: "Run a 10k", topics: ["Notes", "Tasks", "Activity", "Injuries"] }],
      pinnedIds: [],
    });
    const notes = readLegacyLocalSpaces()[0].notes ?? "";
    expect(notes).toContain("Run a 10k");
    expect(notes).toContain("Injuries");
    // The three seeded defaults are not the user's writing.
    expect(notes).not.toContain("Tasks");
  });

  it("drops entries with no id or name rather than making a nameless board", () => {
    seed({ spaces: [{ id: "", name: "Nameless" }, { id: "space-2", name: "" }, null, "junk"], pinnedIds: [] });
    expect(readLegacyLocalSpaces()).toEqual([]);
  });

  it("returns nothing once the marker is set, so deletes cannot resurrect the blob", () => {
    seed({ spaces: [{ id: "space-1", name: "Health" }], pinnedIds: [] });
    markLegacyLocalSpacesMigrated();
    expect(store.get(LEGACY_LOCAL_SPACES_MIGRATED_KEY)).toBe("1");
    expect(readLegacyLocalSpaces()).toEqual([]);
  });

  it("survives a corrupt blob", () => {
    store.set(LEGACY_LOCAL_SPACES_KEY, "{not json");
    expect(readLegacyLocalSpaces()).toEqual([]);
  });
});
