import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStore = new Map<string, string>();
vi.mock("../../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => memoryStore.get(key) ?? null,
      setSync: (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeSync: (key: string) => {
        memoryStore.delete(key);
      },
    },
  },
}));

import { clearMemories, loadMemories, memoryCount, removeMemory, saveMemory, updateMemory } from "./aiMemory";

beforeEach(() => {
  memoryStore.clear();
});

describe("aiMemory", () => {
  it("saves and loads a memory with a clamped default confidence", () => {
    const entry = saveMemory({ kind: "routine", content: "오전에 외부 마감 일을 미루는 경향" });
    expect(entry.confidence).toBe(0.3);
    const loaded = loadMemories();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ kind: "routine", content: "오전에 외부 마감 일을 미루는 경향" });
  });

  it("clamps out-of-range confidence on save and update", () => {
    const entry = saveMemory({ kind: "preference", content: "5분 쪼개기 싫어함", confidence: 5 });
    expect(entry.confidence).toBe(1);
    const updated = updateMemory(entry.id, { confidence: -2 });
    expect(updated?.confidence).toBe(0);
  });

  it("rejects entries with an invalid kind or empty content on load", () => {
    memoryStore.set(
      "focusflow.aiMemory.v1",
      JSON.stringify([
        { id: "a", kind: "bogus", content: "x", confidence: 0.5, createdAt: "", updatedAt: "", expiresAt: "" },
        { id: "b", kind: "fact", content: "   ", confidence: 0.5, createdAt: "", updatedAt: "", expiresAt: "" },
        { id: "c", kind: "fact", content: "유효한 사실", confidence: 0.5, createdAt: "2026-07-09", updatedAt: "2026-07-09", expiresAt: "" },
      ]),
    );
    const loaded = loadMemories();
    expect(loaded.map((m) => m.id)).toEqual(["c"]);
  });

  it("drops expired memories at load time", () => {
    saveMemory({ kind: "fact", content: "만료됨", expiresAt: "2000-01-01T00:00:00.000Z" });
    saveMemory({ kind: "fact", content: "안 만료됨" });
    expect(loadMemories().map((m) => m.content)).toEqual(["안 만료됨"]);
  });

  it("updates content and bumps updatedAt so it sorts first", async () => {
    const first = saveMemory({ kind: "fact", content: "첫번째" });
    await new Promise((r) => setTimeout(r, 5));
    saveMemory({ kind: "fact", content: "두번째" });
    updateMemory(first.id, { content: "첫번째(수정)" });
    expect(loadMemories()[0].content).toBe("첫번째(수정)");
  });

  it("removes and clears", () => {
    const a = saveMemory({ kind: "fact", content: "A" });
    saveMemory({ kind: "fact", content: "B" });
    removeMemory(a.id);
    expect(memoryCount()).toBe(1);
    clearMemories();
    expect(memoryCount()).toBe(0);
  });

  it("survives a corrupted blob", () => {
    memoryStore.set("focusflow.aiMemory.v1", "{broken");
    expect(loadMemories()).toEqual([]);
  });
});
