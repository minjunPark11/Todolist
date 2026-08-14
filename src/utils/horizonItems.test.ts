import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import type { LearningPath } from "../lib/ai/learningPaths/types";
import { addDays } from "./date";
import {
  buildHorizonItems,
  carryoverItemsForHorizonAnchor,
  itemsForBoard,
  itemsForHorizon,
  itemsForHorizonAnchor,
  DEFAULT_HORIZON_COLOR,
} from "./horizonItems";

const TODAY = "2026-08-14";

function path(overrides: Partial<LearningPath> = {}): LearningPath {
  return {
    id: "p1",
    goal: "HSK4",
    milestones: [],
    source: "user",
    createdAt: TODAY,
    updatedAt: TODAY,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Vocab drill",
    status: "todo",
    scheduledDate: TODAY,
    dueDate: "",
    projectId: "",
    archivedAt: "",
    ...overrides,
  } as Task;
}

describe("buildHorizonItems", () => {
  it("puts an undated goal on life and a dated one where its date says", () => {
    const items = buildHorizonItems({
      paths: [path(), path({ id: "p2", goal: "Thesis", targetDate: addDays(TODAY, 200) })],
      tasks: [],
      today: TODAY,
    });
    expect(items.find((item) => item.sourceId === "p1")?.horizon).toBe("life");
    expect(items.find((item) => item.sourceId === "p2")?.horizon).toBe("year");
  });

  it("uses explicit schedule before the compatibility target and hides unscheduled goals", () => {
    const items = buildHorizonItems({
      paths: [
        path({
          id: "scheduled",
          schedule: { unit: "year", startDate: "2027-01-01" },
          targetDate: addDays(TODAY, 2),
        }),
        path({ id: "hidden", schedule: { unit: "unscheduled" } }),
      ],
      tasks: [],
      today: TODAY,
    });
    expect(items.find((item) => item.sourceId === "scheduled")?.horizon).toBe("year");
    expect(items.some((item) => item.sourceId === "hidden")).toBe(false);
  });

  it("lets a milestone inherit its path's date", () => {
    // Otherwise a freshly proposed path scatters: the goal lands on "year"
    // while all of its milestones fall to "life".
    const items = buildHorizonItems({
      paths: [
        path({
          targetDate: addDays(TODAY, 200),
          milestones: [
            { id: "m1", title: "800 words", doneCriteria: "", cardIds: [] },
            { id: "m2", title: "Mock exam", doneCriteria: "", cardIds: [], targetDate: addDays(TODAY, 20) },
          ],
        }),
      ],
      tasks: [],
      today: TODAY,
    });
    expect(items.find((item) => item.sourceId === "m1")?.horizon).toBe("year");
    expect(items.find((item) => item.sourceId === "m2")?.horizon).toBe("month");
  });

  it("carries the goal onto milestone and linked-task cards", () => {
    const items = buildHorizonItems({
      paths: [
        path({
          milestones: [{ id: "m1", title: "800 words", doneCriteria: "", cardIds: [], taskIds: ["t1"] }],
        }),
      ],
      tasks: [task()],
      today: TODAY,
    });
    expect(items.find((item) => item.sourceId === "m1")?.parentTitle).toBe("HSK4");
    expect(items.find((item) => item.sourceId === "t1")?.parentTitle).toBe("800 words");
  });

  it("drops the cascade line when it would just repeat the card title", () => {
    // A task materialised from a milestone starts with the milestone's title.
    const items = buildHorizonItems({
      paths: [
        path({
          milestones: [{ id: "m1", title: "Vocab drill", doneCriteria: "", cardIds: [], taskIds: ["t1"] }],
        }),
      ],
      tasks: [task({ title: "Vocab drill" })],
      today: TODAY,
    });
    expect(items.find((item) => item.sourceId === "t1")?.parentTitle).toBeUndefined();
  });

  it("skips tasks with no date at all and archived ones", () => {
    const items = buildHorizonItems({
      paths: [],
      tasks: [
        task({ id: "dated" }),
        task({ id: "undated", scheduledDate: "", dueDate: "" }),
        task({ id: "archived", archivedAt: "2026-01-01T00:00:00.000Z" }),
      ],
      today: TODAY,
    });
    expect(items.map((item) => item.sourceId)).toEqual(["dated"]);
  });

  it("falls back to the due date when nothing is scheduled", () => {
    const items = buildHorizonItems({
      paths: [],
      tasks: [task({ scheduledDate: "", dueDate: addDays(TODAY, 3) })],
      today: TODAY,
    });
    expect(items[0].horizon).toBe("week");
  });

  it("takes the board colour from the space, and the goal's for linked tasks", () => {
    const colors = new Map([["proj", "#34c759"]]);
    const items = buildHorizonItems({
      paths: [
        path({
          projectId: "proj",
          milestones: [{ id: "m1", title: "800 words", doneCriteria: "", cardIds: [], taskIds: ["t1"] }],
        }),
      ],
      tasks: [task(), task({ id: "t2", projectId: "" })],
      today: TODAY,
      colorByProjectId: colors,
    });
    expect(items.find((item) => item.sourceId === "p1")?.color).toBe("#34c759");
    expect(items.find((item) => item.sourceId === "t1")?.color).toBe("#34c759");
    expect(items.find((item) => item.sourceId === "t2")?.color).toBe(DEFAULT_HORIZON_COLOR);
  });

  it("marks user-completed goals done", () => {
    const items = buildHorizonItems({
      paths: [path({ completedAt: "2026-08-13T00:00:00.000Z" })],
      tasks: [],
      today: TODAY,
    });
    expect(items[0].done).toBe(true);
  });
});

describe("itemsForBoard", () => {
  it("gives a goal, its milestones and its tasks the same board", () => {
    const items = buildHorizonItems({
      paths: [
        path({
          projectId: "proj-a",
          milestones: [{ id: "m1", title: "Grammar", taskIds: ["t-linked"] }],
        } as Partial<LearningPath>),
      ],
      tasks: [task({ id: "t-linked", projectId: "" })],
      today: TODAY,
    });
    expect(itemsForBoard(items, "proj-a").map((item) => item.sourceId).sort()).toEqual(["m1", "p1", "t-linked"]);
  });

  it("keeps a linked task on its goal's board, not its own projectId (D3)", () => {
    const items = buildHorizonItems({
      paths: [
        path({
          projectId: "proj-a",
          milestones: [{ id: "m1", title: "Grammar", taskIds: ["t-linked"] }],
        } as Partial<LearningPath>),
      ],
      // The task claims a different project; the goal's board wins so the
      // card's colour and its heading cannot disagree.
      tasks: [task({ id: "t-linked", projectId: "proj-b" })],
      today: TODAY,
    });
    const linked = items.find((item) => item.sourceId === "t-linked");
    expect(linked?.boardId).toBe("proj-a");
    expect(itemsForBoard(items, "proj-b")).toEqual([]);
  });

  it("matches nothing for an empty board id rather than everything", () => {
    const items = buildHorizonItems({
      paths: [path()],
      tasks: [task({ id: "loose", projectId: "" })],
      today: TODAY,
    });
    expect(items.some((item) => !item.boardId)).toBe(true);
    expect(itemsForBoard(items, "")).toEqual([]);
  });
});

describe("itemsForHorizon", () => {
  it("sorts unfinished first, then by date, with undated last", () => {
    const items = buildHorizonItems({
      paths: [],
      tasks: [
        task({ id: "late", scheduledDate: addDays(TODAY, 5) }),
        task({ id: "soon", scheduledDate: addDays(TODAY, 2) }),
        task({ id: "done", scheduledDate: addDays(TODAY, 1), status: "done" }),
      ],
      today: TODAY,
    });
    expect(itemsForHorizon(items, "week").map((item) => item.sourceId)).toEqual(["soon", "late", "done"]);
  });
});

describe("period anchored horizon items", () => {
  it("shows only goals belonging to the selected calendar period", () => {
    const items = buildHorizonItems({
      paths: [
        path({ id: "aug", schedule: { unit: "month", startDate: "2026-08-01" } }),
        path({ id: "sep", schedule: { unit: "month", startDate: "2026-09-01" } }),
      ],
      tasks: [],
      today: TODAY,
    });
    expect(itemsForHorizonAnchor(items, "month", "2026-09-01").map((item) => item.sourceId)).toEqual(["sep"]);
  });

  it("derives unfinished goals from earlier periods as carryover only on the current period", () => {
    const items = buildHorizonItems({
      paths: [
        path({ id: "july", schedule: { unit: "month", startDate: "2026-07-01" } }),
        path({ id: "done", schedule: { unit: "month", startDate: "2026-06-01" }, completedAt: TODAY }),
      ],
      tasks: [],
      today: TODAY,
    });
    expect(carryoverItemsForHorizonAnchor(items, "month", "2026-08-01", true).map((item) => item.sourceId)).toEqual(["july"]);
    expect(carryoverItemsForHorizonAnchor(items, "month", "2026-09-01", false)).toEqual([]);
  });

  it("anchors compatibility Tasks to the selected period", () => {
    const items = buildHorizonItems({
      paths: [],
      tasks: [task({ id: "aug-week", scheduledDate: "2026-08-17" }), task({ id: "sep", scheduledDate: "2026-09-20" })],
      today: TODAY,
    });
    expect(itemsForHorizonAnchor(items, "week", "2026-08-16").map((item) => item.sourceId)).toEqual(["aug-week"]);
    expect(itemsForHorizonAnchor(items, "month", "2026-09-01").map((item) => item.sourceId)).toEqual(["sep"]);
  });
});
