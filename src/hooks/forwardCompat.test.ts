// M0, the forward-compatibility contract (SPACES_CLICKUP_REDESIGN.md §5).
//
// Every normalizer used to be a whitelist: it picked the fields it knew and
// built a fresh object, dropping the rest. normalizeData is the gate all
// outside data passes through, so a client one version behind would load a
// record written by a newer one, quietly drop the field it did not recognise,
// and save the result back over the account. The failure is silent.
//
// These tests exist so that stops being true by accident. Deleting a spread
// from any normalizer fails one of them.
import { beforeEach, describe, expect, it, vi } from "vitest";

// usePlannerData reaches for the platform adapter at import time, and the node
// test environment has no window for it to bind to.
const store = new Map<string, string>();
vi.mock("../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => void store.set(key, value),
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

import { normalizeData } from "./usePlannerData";

/** Stands in for a field some future version added and this build has never seen. */
const FUTURE = { listId: "list-7", futureFlag: true };

function withFuture<T extends object>(record: T) {
  return { ...record, ...FUTURE };
}

beforeEach(() => store.clear());

describe("normalizeData carries fields it does not know", () => {
  it("keeps them on a task — this is the one the Spaces migration depends on", () => {
    const [task] = normalizeData({
      tasks: [withFuture({ id: "task-1", title: "Write it down" })],
    }).tasks;
    expect(task).toMatchObject(FUTURE);
    // The known fields are still normalized, not merely passed along.
    expect(task.title).toBe("Write it down");
    expect(task.priority).toBe("none");
  });

  it("keeps them on a project", () => {
    const [project] = normalizeData({
      projects: [withFuture({ id: "project-1", name: "Career" })],
    }).projects;
    expect(project).toMatchObject(FUTURE);
    expect(project.status).toBe("active");
  });

  it("keeps them on a subtask", () => {
    const [subtask] = normalizeData({
      subtasks: [withFuture({ id: "sub-1", taskId: "task-1", title: "Step" })],
    }).subtasks;
    expect(subtask).toMatchObject(FUTURE);
  });

  it("keeps them on a focus session", () => {
    const [session] = normalizeData({
      focusSessions: [withFuture({ id: "focus-1", taskId: "task-1", status: "completed" })],
    }).focusSessions;
    expect(session).toMatchObject(FUTURE);
  });

  it("keeps them on a goal and on its milestones", () => {
    const [path] = normalizeData({
      learningPaths: [
        withFuture({
          id: "path-1",
          goal: "Ship it",
          source: "user",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          milestones: [withFuture({ id: "m-1", title: "First", doneCriteria: "", cardIds: [] })],
        }),
      ],
    }).learningPaths;
    expect(path).toMatchObject(FUTURE);
    expect(path.milestones[0]).toMatchObject(FUTURE);
  });

  it("keeps them on a folder and a list", () => {
    const data = normalizeData({
      folders: [withFuture({ id: "folder-1", spaceId: "space-1", name: "H1" })],
      lists: [withFuture({ id: "list-1", spaceId: "space-1", name: "Tasks" })],
    });
    expect(data.folders[0]).toMatchObject(FUTURE);
    expect(data.lists[0]).toMatchObject(FUTURE);
  });

  it("keeps them on app settings — feature toggles will live here", () => {
    const appSettings = normalizeData({
      appSettings: { ...FUTURE, theme: "dark" } as never,
    }).appSettings;
    expect(appSettings).toMatchObject(FUTURE);
    expect(appSettings.theme).toBe("dark");
  });
});

describe("normalizeData still repairs what it does know", () => {
  it("does not let a passed-through value defeat validation", () => {
    const [task] = normalizeData({
      // A priority no build has ever accepted must not survive just because the
      // spread ran first.
      tasks: [{ id: "task-1", title: "Bad", priority: "sideways" as never }],
    }).tasks;
    expect(task.priority).toBe("none");
  });

  it("still promotes a legacy timed task onto scheduledDate", () => {
    const [task] = normalizeData({
      tasks: [{ id: "task-1", title: "Legacy", dueDate: "2026-08-01", startTime: "09:00" }],
    }).tasks;
    expect(task.scheduledDate).toBe("2026-08-01");
  });

  it("never restores a milestone status from disk", () => {
    // progress.ts derives this; a status a model once asserted must not come
    // back through the passthrough spread.
    const [path] = normalizeData({
      learningPaths: [
        {
          id: "path-1",
          goal: "Ship it",
          source: "user",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          milestones: [{ id: "m-1", title: "First", cardIds: [], status: "done" }],
        } as never,
      ],
    }).learningPaths;
    expect(path.milestones[0].status).toBeUndefined();
  });
});
