import { describe, expect, it } from "vitest";
import type { ContextCard } from "../contextCards/types";
import { suggestMilestoneForCard } from "./matchMilestone";
import type { LearningPath, Milestone } from "./types";

function card(id: string, title: string, detectedItems: string[] = [], inferredDomains: string[] = []): ContextCard {
  return {
    id,
    title,
    rawInput: "",
    detectedItems,
    inferredDomains,
    workTypes: [],
    currentStatus: [],
    likelyBlockers: [],
    missingInfo: [],
    possibleOutputs: [],
    relatedTaskIds: [],
    relatedProjectIds: [],
    relatedNotePaths: [],
    source: "brain_dump",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

function milestone(id: string, title: string, cardIds: string[] = []): Milestone {
  return { id, title, doneCriteria: `${title} 산출물 1개`, cardIds };
}

function path(milestones: Milestone[]): LearningPath {
  return {
    id: "lpath-test",
    goal: "HSK4 수준 중국어",
    milestones,
    source: "assistant",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

describe("suggestMilestoneForCard", () => {
  const hskPath = path([
    milestone("m1", "HSK4 단어 800개 암기"),
    milestone("m2", "HSK4 독해 문제집 1권 완주"),
    milestone("m3", "HSK4 모의고사 3회 응시"),
  ]);

  it("matches the milestone whose title tokens overlap the card", () => {
    const suggestion = suggestMilestoneForCard(hskPath, card("c1", "중국어 단어 암기가 밀렸다", ["단어 암기"]), []);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.milestone.id).toBe("m1");
    expect(suggestion?.matched).toBe(true);
  });

  it("matches via detected items and domains, not just the title", () => {
    const suggestion = suggestMilestoneForCard(hskPath, card("c1", "이번 주 할 일", ["독해 문제집 풀기"], ["language learning"]), []);
    expect(suggestion?.milestone.id).toBe("m2");
    expect(suggestion?.matched).toBe(true);
  });

  it("falls back to the current milestone when nothing overlaps", () => {
    const suggestion = suggestMilestoneForCard(hskPath, card("c1", "졸업논문 서론"), []);
    expect(suggestion?.milestone.id).toBe("m1");
    expect(suggestion?.index).toBe(0);
    expect(suggestion?.matched).toBe(false);
  });

  it("breaks score ties in path order (earlier milestone wins)", () => {
    const tied = path([milestone("m1", "HSK4 단어 암기"), milestone("m2", "HSK4 단어 복습")]);
    const suggestion = suggestMilestoneForCard(tied, card("c1", "HSK4 준비"), []);
    expect(suggestion?.milestone.id).toBe("m1");
  });

  it("ignores single-character tokens so particles don't create matches", () => {
    const noisy = path([milestone("m1", "A 반 배정"), milestone("m2", "리스닝 스크립트 3편 정리"), milestone("m3", "말하기 녹음 5개")]);
    const suggestion = suggestMilestoneForCard(noisy, card("c1", "리스닝 스크립트 받아쓰기"), []);
    expect(suggestion?.milestone.id).toBe("m2");
  });

  it("returns null for a path with no milestones", () => {
    expect(suggestMilestoneForCard(path([]), card("c1", "아무거나"), [])).toBeNull();
  });
});
