import { describe, expect, it } from "vitest";
import type { LearningPath, Project } from "../../types";
import { archiveBoardList, moveGoalToBoardList, patchBoardList, reconcileBoardAssignments, sanitizeBoardLists } from "./boardLists";

const project = { id: "p1", boardLists: [{ id: "l1", name: "Later", order: 4 }] } as Project;
const goal = (patch: Partial<LearningPath> = {}) => ({ id: "g1", goal: "Goal", milestones: [], source: "user", createdAt: "x", updatedAt: "x", projectId: "p1", ...patch }) as LearningPath;

describe("board lists", () => {
  it("sanitizes, deduplicates, and reindexes lists", () => {
    expect(sanitizeBoardLists([{ id: "a", name: " A ", order: 8 }, { id: "a", name: "dup", order: 0 }, { id: "b", name: "B", order: 2 }]))
      .toEqual([{ id: "b", name: "B", order: 0 }, { id: "a", name: "A", order: 1 }]);
  });
  it("clears invalid cross-board list assignments", () => {
    expect(reconcileBoardAssignments([project], [goal({ boardListId: "missing", boardOrder: 2 })])[0]).toMatchObject({ boardListId: undefined, boardOrder: undefined });
  });
  it("keeps a goal but clears its board fields when the project is gone", () => {
    expect(reconcileBoardAssignments([], [goal({ boardListId: "l1", boardOrder: 2 })])[0]).toMatchObject({ projectId: undefined, boardListId: undefined, boardOrder: undefined });
  });
  it("moves a goal only to a valid list and archives without deleting goals", () => {
    const moved = moveGoalToBoardList([goal()], [project], "g1", "l1", "now");
    expect(moved[0].boardListId).toBe("l1");
    const archived = archiveBoardList([project], moved, "p1", "l1", "later");
    expect(archived.paths).toHaveLength(1);
    expect(archived.paths[0].boardListId).toBeUndefined();
    expect(archived.projects[0].boardLists?.[0].archivedAt).toBe("later");
  });
  it("reorders lists and persists contiguous order values", () => {
    const withLists = { ...project, boardLists: [{ id: "a", name: "A", order: 0 }, { id: "b", name: "B", order: 1 }] };
    expect(patchBoardList([withLists], "p1", "b", { order: 0 }, "now")[0].boardLists?.map((list) => [list.id, list.order]))
      .toEqual([["b", 0], ["a", 1]]);
  });
});
