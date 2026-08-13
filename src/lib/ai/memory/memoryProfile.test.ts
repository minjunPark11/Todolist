import { describe, expect, it } from "vitest";
import type { AiMemoryEntry } from "./types";
import { MEMORY_PROFILE_MAX_CHARS, buildMemoryProfileBlock } from "./memoryProfile";

function mem(partial: Partial<AiMemoryEntry> & Pick<AiMemoryEntry, "content">): AiMemoryEntry {
  return {
    id: partial.id ?? `mem-${partial.content}`,
    kind: partial.kind ?? "routine",
    content: partial.content,
    confidence: partial.confidence ?? 0.6,
    createdAt: partial.createdAt ?? "2026-07-09T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-07-09T00:00:00.000Z",
    expiresAt: partial.expiresAt ?? "",
  };
}

describe("buildMemoryProfileBlock", () => {
  it("returns undefined when there are no memories", () => {
    expect(buildMemoryProfileBlock([])).toBeUndefined();
  });

  it("excludes memories below the confidence threshold", () => {
    expect(buildMemoryProfileBlock([mem({ content: "저신뢰", confidence: 0.2 })])).toBeUndefined();
  });

  it("lists eligible memories with their kind label", () => {
    const block = buildMemoryProfileBlock([mem({ content: "5분 쪼개기 싫어함", kind: "preference", confidence: 0.8 })]);
    expect(block).toContain("[선호] 5분 쪼개기 싫어함");
    expect(block).toContain("user-approved");
  });

  it("orders by confidence desc, then newest", () => {
    const block = buildMemoryProfileBlock([
      mem({ content: "낮음", confidence: 0.5, updatedAt: "2026-07-09T10:00:00.000Z" }),
      mem({ content: "높음", confidence: 0.9, updatedAt: "2026-07-01T00:00:00.000Z" }),
    ]);
    expect(block!.indexOf("높음")).toBeLessThan(block!.indexOf("낮음"));
  });

  it("caps the block at MEMORY_PROFILE_MAX_CHARS, dropping lowest-ranked first", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      mem({ content: `아주 긴 메모리 항목 번호 ${i} 반복 반복 반복 반복`, confidence: 0.5 + (i % 5) * 0.05, id: `m${i}` }),
    );
    const block = buildMemoryProfileBlock(many);
    expect(block!.length).toBeLessThanOrEqual(MEMORY_PROFILE_MAX_CHARS);
    // At least the header + one line fit.
    expect(block!.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("respects a custom maxChars", () => {
    const block = buildMemoryProfileBlock(
      [mem({ content: "한 줄", confidence: 0.9 }), mem({ content: "두 줄", confidence: 0.8 })],
      1000,
    );
    expect(block!.length).toBeLessThanOrEqual(1000);
  });
});
