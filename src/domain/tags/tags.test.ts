import { describe, expect, it } from "vitest";
import type { Tag, Task, TaskTag } from "../../types";
import {
  activeTags,
  backfillTaskTags,
  isUserTag,
  linkTaskTags,
  removeTag,
  sanitizeTag,
  sanitizeTaskTag,
  tagIdFor,
  tagNamesForTask,
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

// §26.9: the relation is the canonical answer, so creation writes it rather
// than leaving the next load's backfill to infer it from the strings.
describe("linkTaskTags", () => {
  it("creates the tag and the link for a name nothing holds yet", () => {
    const next = linkTaskTags("t1", ["Deep work"], [], [], NOW);
    expect(next.tags.map((tag) => tag.name)).toEqual(["Deep work"]);
    expect(next.taskTags).toEqual([
      { id: taskTagIdFor("t1", tagIdFor("Deep work")), taskId: "t1", tagId: tagIdFor("Deep work"), createdAt: NOW },
    ]);
  });

  // The id was derived from the name a tag was BORN with. Deriving it again
  // from the name it carries now would answer with an id nothing holds, and
  // the one tag would become two.
  it("resolves to an existing tag by name rather than re-deriving its id", () => {
    const renamed: Tag[] = [{ id: "tag-work", name: "Job", createdAt: NOW, updatedAt: NOW }];
    const next = linkTaskTags("t1", ["job"], renamed, [], NOW);
    expect(next.tags).toBe(renamed);
    expect(next.taskTags.map((link) => link.tagId)).toEqual(["tag-work"]);
  });

  it("is idempotent — the pair can only ever produce one row", () => {
    const first = linkTaskTags("t1", ["Work"], [], [], NOW);
    const second = linkTaskTags("t1", ["Work"], first.tags, first.taskTags, NOW);
    expect(second.taskTags).toBe(first.taskTags);
    expect(second.tags).toBe(first.tags);
  });

  it("skips legacy membership markers, which are not the user's tags", () => {
    const next = linkTaskTags("t1", ["space:8f2a", "Work"], [], [], NOW);
    expect(next.tags.map((tag) => tag.name)).toEqual(["Work"]);
  });

  it("returns the same arrays when there is nothing to write", () => {
    const tags: Tag[] = [];
    const links: TaskTag[] = [];
    expect(linkTaskTags("t1", [], tags, links, NOW).tags).toBe(tags);
    expect(linkTaskTags("", ["Work"], tags, links, NOW).taskTags).toBe(links);
  });
});

describe("tagNamesForTask", () => {
  const tags: Tag[] = [{ id: "tag-work", name: "Job", createdAt: NOW, updatedAt: NOW }];
  const links: TaskTag[] = [
    { id: taskTagIdFor("t1", "tag-work"), taskId: "t1", tagId: "tag-work", createdAt: NOW },
  ];

  // The whole point of making the relation canonical: a renamed tag reads as
  // its current name, where the strings on the Task still say the old one.
  it("answers with the record's name, not the string left on the task", () => {
    expect(tagNamesForTask(task({ id: "t1", tags: ["Work"] }), tags, links)).toEqual(["Job"]);
  });

  it("falls back to the strings for a task the relation does not know", () => {
    expect(tagNamesForTask(task({ id: "t9", tags: ["Work"] }), tags, links)).toEqual(["Work"]);
  });

  it("leaves legacy markers out of the fallback", () => {
    expect(tagNamesForTask(task({ id: "t9", tags: ["space:8f2a", "Work"] }), tags, links)).toEqual(["Work"]);
  });
});
