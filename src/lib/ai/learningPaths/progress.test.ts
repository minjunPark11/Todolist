import { describe, expect, it } from "vitest";
import type { CardStage, ContextCard } from "../contextCards/types";
import { currentMilestoneIndex, formatBreadcrumb, milestoneIndexForCard, resolveMilestoneStatus } from "./progress";
import type { LearningPath, Milestone } from "./types";

function card(id: string, stage?: CardStage): ContextCard {
  return {
    id,
    title: `card-${id}`,
    rawInput: "",
    detectedItems: [],
    inferredDomains: [],
    workTypes: [],
    currentStatus: [],
    likelyBlockers: [],
    missingInfo: [],
    possibleOutputs: [],
    stage,
    relatedTaskIds: [],
    relatedProjectIds: [],
    relatedNotePaths: [],
    source: "brain_dump",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

function milestone(id: string, cardIds: string[] = []): Milestone {
  return { id, title: `단계 ${id}`, doneCriteria: `${id} 산출물 1개`, cardIds };
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

describe("resolveMilestoneStatus", () => {
  it("is upcoming with no linked cards (slice A state)", () => {
    expect(resolveMilestoneStatus(milestone("m1"), [])).toBe("upcoming");
  });

  it("is current when any linked card is progressing", () => {
    expect(resolveMilestoneStatus(milestone("m1", ["c1"]), [card("c1", "info_gathering")])).toBe("current");
  });

  it("is done only when every linked card reached executing", () => {
    expect(resolveMilestoneStatus(milestone("m1", ["c1", "c2"]), [card("c1", "executing"), card("c2", "executing")])).toBe("done");
    expect(resolveMilestoneStatus(milestone("m1", ["c1", "c2"]), [card("c1", "executing"), card("c2", "planned")])).toBe("current");
  });

  it("stays upcoming when linked cards are only goal_captured", () => {
    expect(resolveMilestoneStatus(milestone("m1", ["c1"]), [card("c1", "goal_captured")])).toBe("upcoming");
  });
});

describe("currentMilestoneIndex", () => {
  it("points at the first milestone when nothing is linked yet", () => {
    expect(currentMilestoneIndex(path([milestone("m1"), milestone("m2")]), [])).toBe(0);
  });

  it("skips done milestones", () => {
    const cards = [card("c1", "executing")];
    expect(currentMilestoneIndex(path([milestone("m1", ["c1"]), milestone("m2")]), cards)).toBe(1);
  });

  it("falls back to the last milestone when everything is done", () => {
    const cards = [card("c1", "executing"), card("c2", "executing")];
    expect(currentMilestoneIndex(path([milestone("m1", ["c1"]), milestone("m2", ["c2"])]), cards)).toBe(1);
  });
});

describe("milestoneIndexForCard", () => {
  it("returns the index of the milestone holding the card", () => {
    expect(milestoneIndexForCard(path([milestone("m1"), milestone("m2", ["c1"])]), "c1")).toBe(1);
  });

  it("returns null for an unlinked card", () => {
    expect(milestoneIndexForCard(path([milestone("m1")]), "c9")).toBeNull();
  });
});

describe("formatBreadcrumb", () => {
  it("renders goal, 1-based position, and the current milestone title", () => {
    const crumb = formatBreadcrumb(path([milestone("m1"), milestone("m2"), milestone("m3")]), []);
    expect(crumb).toEqual({ goal: "HSK4 수준 중국어", position: "1/3", milestoneTitle: "단계 m1" });
  });

  it("returns null for a path with no milestones", () => {
    expect(formatBreadcrumb(path([]), [])).toBeNull();
  });
});
