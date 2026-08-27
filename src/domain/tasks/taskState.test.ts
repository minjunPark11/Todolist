import { describe, expect, it } from "vitest";
import { isCompleted, isTaskAlive, isTaskOpen, isTrashed, isWontDo } from "./taskState";
import { isActiveTask, isArchivedTask } from "../../utils/planner";
import { selectActiveTasks, selectLiveTasks } from "./selectors";
import { isTaskActive } from "./scopeQuery";
import type { List, Task } from "../../types";
import { normalizeData } from "../plannerData/normalize";

function task(over: Partial<Task> = {}): Task {
  return { id: "t1", title: "A task", status: "todo", projectId: "", listId: "l1", ...over } as Task;
}

const NOW = "2026-08-19T09:00:00.000Z";
const OPEN = task();
const DONE = task({ id: "done", status: "done", completedAt: NOW });
const TRASHED = task({ id: "trashed", deletedAt: NOW });
const GIVEN_UP = task({ id: "wont", wontDoAt: NOW });
const LEGACY_ARCHIVED = task({ id: "legacy", status: "archived", archivedAt: NOW });

describe("task state (audit D-24)", () => {
  it("separates the three terminal states", () => {
    expect(isTrashed(TRASHED)).toBe(true);
    expect(isWontDo(GIVEN_UP)).toBe(true);
    expect(isCompleted(DONE)).toBe(true);

    expect(isTrashed(OPEN)).toBe(false);
    expect(isWontDo(OPEN)).toBe(false);
    expect(isCompleted(OPEN)).toBe(false);
  });

  // D-20 sends the legacy status here, and doing it in the predicate rather
  // than only in a migration is what makes every screen agree on day one.
  it("reads a legacy archived task as given up on", () => {
    expect(isWontDo(LEGACY_ARCHIVED)).toBe(true);
    expect(isTaskAlive(LEGACY_ARCHIVED)).toBe(false);
  });

  it("keeps alive and open apart", () => {
    // A finished task still exists; it is just not work any more.
    expect(isTaskAlive(DONE)).toBe(true);
    expect(isTaskOpen(DONE)).toBe(false);

    for (const gone of [TRASHED, GIVEN_UP, LEGACY_ARCHIVED]) {
      expect(isTaskAlive(gone)).toBe(false);
      expect(isTaskOpen(gone)).toBe(false);
    }

    expect(isTaskAlive(OPEN)).toBe(true);
    expect(isTaskOpen(OPEN)).toBe(true);
  });

  // The point of the consolidation: three modules used to answer this with
  // three different rules, two of them called some variant of "active".
  describe("every survivor of the three old predicates now agrees", () => {
    const all = [OPEN, DONE, TRASHED, GIVEN_UP, LEGACY_ARCHIVED];

    it("utils/planner", () => {
      expect(all.filter(isActiveTask).map((t) => t.id)).toEqual(["t1", "done"]);
      expect(all.filter(isArchivedTask).map((t) => t.id)).toEqual(["wont", "legacy"]);
    });

    it("domain selectors", () => {
      expect(selectLiveTasks(all).map((t) => t.id)).toEqual(["t1", "done"]);
      expect(selectActiveTasks(all).map((t) => t.id)).toEqual(["t1"]);
    });
  });

  // The second axis stays where it needs the Lists, and composes the first.
  describe("the List-aware sibling", () => {
    const live: List = { id: "l1", name: "List" } as List;
    const archivedList: List = { id: "l1", name: "List", archivedAt: NOW } as List;

    it("adds the container's state to the task's own", () => {
      expect(isTaskActive(OPEN, [live])).toBe(true);
      expect(isTaskActive(OPEN, [archivedList])).toBe(false);
      // And still refuses everything the task's own state refuses.
      expect(isTaskActive(GIVEN_UP, [live])).toBe(false);
    });
  });

  // D-20's migration runs on load, the way every migration in this app does.
  describe("the archived migration", () => {
    // It used to hand back the workflow status `previousStatus` held. There is
    // one non-terminal lifecycle value now (Ch. 26 §26.3.2), so an unarchived
    // task lands on it and `previousStatus` has nothing left to say.
    it("moves the status onto the marker and reopens the task", () => {
      const migrated = normalizeData({
        tasks: [{ id: "a", title: "Filed away", status: "archived", previousStatus: "doing", archivedAt: NOW }],
      } as never).tasks[0];

      expect(migrated.wontDoAt).toBe(NOW);
      expect(migrated.status).toBe("open");
      // The old fields are cleared, not left to be copied forward forever.
      expect(migrated.archivedAt).toBe("");
      expect(migrated.previousStatus).toBeUndefined();
      expect(isWontDo(migrated)).toBe(true);
    });

    it("reopens one that recorded no old status either", () => {
      const migrated = normalizeData({
        tasks: [{ id: "b", title: "Filed away", status: "archived" }],
      } as never).tasks[0];
      expect(migrated.status).toBe("open");
      expect(migrated.wontDoAt).toBeTruthy();
    });

    // The load path IS the migration here, so it runs on every boot.
    it("is idempotent", () => {
      const once = normalizeData({
        tasks: [{ id: "c", title: "Filed away", status: "archived", previousStatus: "doing", archivedAt: NOW }],
      } as never).tasks[0];
      const twice = normalizeData({ tasks: [once] } as never).tasks[0];
      expect(twice.wontDoAt).toBe(once.wontDoAt);
      expect(twice.status).toBe("open");
    });

    it("leaves a task that was never archived alone", () => {
      const untouched = normalizeData({
        tasks: [{ id: "d", title: "Ordinary", status: "doing" }],
      } as never).tasks[0];
      expect(untouched.status).toBe("doing");
      expect(untouched.wontDoAt).toBe("");
      expect(isTaskOpen(untouched)).toBe(true);
    });
  });

  // The reminder queue and calendar sharing hold narrower shapes than Task.
  it("answers for anything carrying the four fields", () => {
    expect(isTaskOpen({ status: "todo" })).toBe(true);
    expect(isTaskOpen({ status: "todo", wontDoAt: NOW })).toBe(false);
    expect(isTaskAlive({ deletedAt: NOW })).toBe(false);
    expect(isTaskAlive({})).toBe(true);
  });
});
