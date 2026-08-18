import { describe, expect, it } from "vitest";
import type { Tag, Task, TaskTag } from "../../types";
import {
  activeTags,
  backfillTaskTags,
  isUserTag,
  removeTag,
  sanitizeTag,
  sanitizeTaskTag,
  tagIdFor,
  tagsForTask,
  taskIdsWithTag,
  taskTagIdFor,
} from "./tags";

const NOW = "2026-08-18T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "p1",
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
    repeatInterval: 0,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

describe("what counts as a user's tag", () => {
  // Left in `Task.tags` on purpose when Space membership stopped reading them:
  // stripping an inert string from every task is the write amplification the
  // store spent a release removing (lib/spaceSelectors). They must not become
  // records, or the sidebar grows a `#space:8f2a…`.
  it("refuses the legacy membership markers", () => {
    expect(isUserTag("space:8f2a")).toBe(false);
    expect(isUserTag("group:abc")).toBe(false);
    expect(isUserTag("  ")).toBe(false);
    expect(isUserTag("학교")).toBe(true);
    expect(isUserTag("spaceship")).toBe(true);
  });
});

describe("identity", () => {
  it("folds case and space so one word is one tag", () => {
    expect(tagIdFor("Work")).toBe(tagIdFor(" work "));
    expect(tagIdFor("학교")).toBe("tag-학교");
  });

  // §6.46 asks for UNIQUE(taskId, tagId). There is no table to declare that
  // on, so the id carries it: the same pair can only make the same row.
  it("derives a link id from both ends", () => {
    expect(taskTagIdFor("t1", "tag-work")).toBe(taskTagIdFor("t1", "tag-work"));
    expect(taskTagIdFor("t1", "tag-work")).not.toBe(taskTagIdFor("t2", "tag-work"));
  });
});

describe("sanitizers", () => {
  it("drops what decides nothing", () => {
    expect(sanitizeTag({ id: "tag-x" })).toBeNull();
    expect(sanitizeTaskTag({ taskId: "t1" })).toBeNull();
    expect(sanitizeTaskTag({ tagId: "tag-x" })).toBeNull();
  });

  it("rebuilds a missing tag id from the name", () => {
    expect(sanitizeTag({ name: " Work " })).toMatchObject({ id: "tag-work", name: "Work" });
  });

  it("rebuilds a link id from its ends, whatever it was stored as", () => {
    expect(sanitizeTaskTag({ id: "junk", taskId: "t1", tagId: "tag-work" })).toMatchObject({
      id: taskTagIdFor("t1", "tag-work"),
    });
  });

  it("carries fields it does not know (M0)", () => {
    expect(sanitizeTag({ name: "work", futureField: 1 })).toMatchObject({ futureField: 1 });
  });
});

// The backfill's whole point: rows are added, and not one Task is rewritten.
describe("backfillTaskTags", () => {
  const tasks = [
    task({ id: "t1", tags: ["학교", "읽기", "space:legacy"] }),
    task({ id: "t2", tags: ["Work", "work"] }),
    task({ id: "t3", tags: ["gone"], deletedAt: NOW }),
  ];

  it("writes down the tags the strings already name, and nothing else", () => {
    const { tags } = backfillTaskTags(tasks, [], [], NOW);
    expect(tags.map((tag) => tag.name).sort()).toEqual(["Work", "읽기", "학교"]);
  });

  it("makes one tag out of two spellings, keeping the first seen", () => {
    const { tags, taskTags } = backfillTaskTags([tasks[1]], [], [], NOW);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe("Work");
    expect(taskTags).toHaveLength(1);
  });

  it("leaves a deleted task's vocabulary out of it", () => {
    const { tags } = backfillTaskTags(tasks, [], [], NOW);
    expect(tags.some((tag) => tag.name === "gone")).toBe(false);
  });

  it("touches no Task", () => {
    const before = tasks.map((entry) => ({ ...entry }));
    backfillTaskTags(tasks, [], [], NOW);
    expect(tasks).toEqual(before);
  });

  it("returns the same arrays on a second run, so a load marks nothing dirty", () => {
    const first = backfillTaskTags(tasks, [], [], NOW);
    const second = backfillTaskTags(tasks, first.tags, first.taskTags, NOW);
    expect(second.tags).toBe(first.tags);
    expect(second.taskTags).toBe(first.taskTags);
  });
});

describe("reads", () => {
  const tags: Tag[] = [
    { id: "tag-work", name: "Work", createdAt: NOW, updatedAt: NOW },
    { id: "tag-old", name: "Old", archivedAt: NOW, createdAt: NOW, updatedAt: NOW },
  ];
  const links: TaskTag[] = [
    { id: taskTagIdFor("t1", "tag-work"), taskId: "t1", tagId: "tag-work", createdAt: NOW },
    { id: taskTagIdFor("t1", "tag-old"), taskId: "t1", tagId: "tag-old", createdAt: NOW },
    { id: taskTagIdFor("t2", "tag-work"), taskId: "t2", tagId: "tag-work", createdAt: NOW },
  ];

  it("hides an archived tag from a task and from the list", () => {
    expect(tagsForTask("t1", tags, links).map((tag) => tag.id)).toEqual(["tag-work"]);
    expect(activeTags(tags).map((tag) => tag.id)).toEqual(["tag-work"]);
  });

  it("gathers the tasks a tag is on", () => {
    expect([...taskIdsWithTag("tag-work", links)].sort()).toEqual(["t1", "t2"]);
  });
});

// §6.46: deleting a tag removes the relationships and keeps the tasks.
describe("removeTag", () => {
  const tags: Tag[] = [{ id: "tag-work", name: "Work", createdAt: NOW, updatedAt: NOW }];
  const links: TaskTag[] = [
    { id: taskTagIdFor("t1", "tag-work"), taskId: "t1", tagId: "tag-work", createdAt: NOW },
  ];

  it("takes its links with it", () => {
    const next = removeTag("tag-work", tags, links);
    expect(next.tags).toEqual([]);
    expect(next.taskTags).toEqual([]);
  });

  it("returns the same arrays when the tag was not there", () => {
    const next = removeTag("tag-missing", tags, links);
    expect(next.tags).toBe(tags);
    expect(next.taskTags).toBe(links);
  });
});
