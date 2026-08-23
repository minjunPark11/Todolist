import { describe, expect, it } from "vitest";
import type { List, ListSection, Task } from "../../types";
import { legacySectionIdFor, migrateLegacyWorkflowStatus } from "./legacyWorkflowStatus";

const NOW = "2026-08-23T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "open",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "",
    categoryId: "",
    parentTaskId: "",
    tags: [],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    listId: "l1",
    ...overrides,
  };
}

const lists: List[] = [
  { id: "l1", projectId: "", spaceId: "", kind: "regular", name: "Work", order: 0, isDefault: false, createdAt: NOW, updatedAt: NOW },
  { id: "l2", projectId: "", spaceId: "", kind: "regular", name: "Home", order: 1, isDefault: false, createdAt: NOW, updatedAt: NOW },
];

describe("migrateLegacyWorkflowStatus (Ch. 26 §26.3.4)", () => {
  it("moves the value onto a Section of the Task's own List", () => {
    const next = migrateLegacyWorkflowStatus([task({ status: "waiting" })], lists, [], NOW);

    expect(next.listSections).toHaveLength(1);
    expect(next.listSections[0]).toMatchObject({ listId: "l1", name: "Waiting" });
    expect(next.tasks[0].status).toBe("open");
    expect(next.tasks[0].sectionId).toBe(legacySectionIdFor("l1", "waiting"));
  });

  // §26.3.4 is explicit: only a List that actually has such a Task gets one.
  // Stamping "Doing" and "Waiting" onto every List would be the app inventing
  // structure nobody asked for.
  it("leaves a List with no such Task without a Section", () => {
    const next = migrateLegacyWorkflowStatus(
      [task({ id: "a", status: "doing", listId: "l1" }), task({ id: "b", listId: "l2" })],
      lists,
      [],
      NOW,
    );
    expect(next.listSections.map((section) => section.listId)).toEqual(["l1"]);
  });

  it("makes one Section per List per value, not one per Task", () => {
    const next = migrateLegacyWorkflowStatus(
      [
        task({ id: "a", status: "waiting", listId: "l1" }),
        task({ id: "b", status: "waiting", listId: "l1" }),
        task({ id: "c", status: "doing", listId: "l1" }),
        task({ id: "d", status: "waiting", listId: "l2" }),
      ],
      lists,
      [],
      NOW,
    );
    expect(next.listSections).toHaveLength(3);
    expect(next.tasks.filter((entry) => entry.sectionId === legacySectionIdFor("l1", "waiting"))).toHaveLength(2);
  });

  // The load path IS the migration, so it runs on every boot.
  it("is idempotent, and touches nothing on the second pass", () => {
    const once = migrateLegacyWorkflowStatus([task({ status: "doing" })], lists, [], NOW);
    const twice = migrateLegacyWorkflowStatus(once.tasks, lists, once.listSections, NOW);

    expect(twice.tasks).toBe(once.tasks);
    expect(twice.listSections).toBe(once.listSections);
  });

  it("returns the same arrays when there is nothing to migrate", () => {
    const tasks = [task(), task({ id: "b", status: "completed" })];
    const sections: ListSection[] = [];
    const next = migrateLegacyWorkflowStatus(tasks, lists, sections, NOW);

    expect(next.tasks).toBe(tasks);
    expect(next.listSections).toBe(sections);
  });

  // A Section the user placed the Task in outranks the app's guess at where
  // the legacy value would have put it.
  it("keeps a Section the Task already had", () => {
    const next = migrateLegacyWorkflowStatus(
      [task({ status: "waiting", sectionId: "sec-mine" })],
      lists,
      [{ id: "sec-mine", listId: "l1", name: "Mine", createdAt: NOW, updatedAt: NOW }],
      NOW,
    );
    expect(next.tasks[0].sectionId).toBe("sec-mine");
    expect(next.tasks[0].status).toBe("open");
  });

  // A Section hangs off a List. With no List to hang it on there is nowhere
  // to put the value — but the dead status still has to go, or the record
  // holds something no predicate can read.
  it("still clears the value for a Task with no resolvable List", () => {
    const next = migrateLegacyWorkflowStatus(
      [task({ status: "doing", listId: "", projectId: "" })],
      [],
      [],
      NOW,
    );
    expect(next.tasks[0].status).toBe("open");
    expect(next.tasks[0].sectionId).toBeUndefined();
    expect(next.listSections).toEqual([]);
  });

  // Two devices migrating the same account independently must arrive at one
  // Section, the way `defaultListIdFor` makes the default List deterministic.
  it("derives the Section id, so two devices agree", () => {
    const a = migrateLegacyWorkflowStatus([task({ status: "waiting" })], lists, [], NOW);
    const b = migrateLegacyWorkflowStatus([task({ status: "waiting" })], lists, [], "2026-09-01T00:00:00.000Z");
    expect(a.listSections[0].id).toBe(b.listSections[0].id);
  });
});
