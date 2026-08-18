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
import type { Task } from "../types";
import { scheduleFromTask } from "../domain/schedule";

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

  // Add List design Phase 1. These two ride in a record that ALREADY syncs, so
  // they are in the same position `Project.spaceId` was: M0 is the only thing
  // between them and a client one version behind writing the List back without
  // them. The colour and the View a user chose would vanish on the next save
  // from any device that had not updated yet.
  it("keeps a list's colour and default View key — fields that ride in a synced record", () => {
    const data = normalizeData({
      lists: [{ id: "list-1", spaceId: "space-1", name: "Tasks", color: "#ff8800", defaultViewKey: "board" }],
    });
    expect(data.lists[0]).toMatchObject({ color: "#ff8800", defaultViewKey: "board" });
  });

  it("keeps a default View key this build cannot open", () => {
    const data = normalizeData({
      lists: [{ id: "list-1", spaceId: "space-1", name: "Tasks", defaultViewKey: "gantt" }],
    });
    expect(data.lists[0].defaultViewKey).toBe("gantt");
  });

  it("keeps them on a folder and a list", () => {
    const data = normalizeData({
      folders: [withFuture({ id: "folder-1", spaceId: "space-1", name: "H1" })],
      lists: [withFuture({ id: "list-1", spaceId: "space-1", name: "Tasks" })],
    });
    expect(data.folders[0]).toMatchObject(FUTURE);
    expect(data.lists[0]).toMatchObject(FUTURE);
  });

  it("keeps them on a space", () => {
    const data = normalizeData({
      spaces: [withFuture({ id: "space-1", name: "Research" })],
    });
    expect(data.spaces[0]).toMatchObject(FUTURE);
  });

  it("keeps a project's spaceId — the one field STEP 5 adds to a synced record", () => {
    // Every other collection this migration touches is brand new, so an older
    // client leaves it alone. `Project.spaceId` is the exception: it rides in
    // a record that already syncs, and M0 is the only thing standing between
    // it and a client one version behind writing the Project back without it.
    const data = normalizeData({
      projects: [{ id: "p1", name: "Drone research", spaceId: "space-1" }],
    });
    expect(data.projects[0].spaceId).toBe("space-1");
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

  // WAS: "still promotes a legacy timed task onto scheduledDate".
  //
  // That repair ran in the direction SCHEDULE_EDITOR_PHASE0_AUDIT.md §6 (1-d)
  // reverses, so it fought every write the calendar makes — a task saved with
  // a time and a date came back out carrying the legacy field again. The
  // record it existed for reads as a timed block on its date without help now,
  // which `scheduleFromTask` covers directly.
  it("leaves a legacy timed task's dates exactly as stored", () => {
    const [task] = normalizeData({
      tasks: [{ id: "task-1", title: "Legacy", dueDate: "2026-08-01", startTime: "09:00" }],
    }).tasks;
    expect([task.dueDate, task.startTime]).toEqual(["2026-08-01", "09:00"]);
    expect(scheduleFromTask(task)).toMatchObject({
      startDate: null,
      dueDate: "2026-08-01",
      startTime: "09:00",
    });
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

// The one exception to M0's "carry what you do not know".
//
// `scheduledDate` is not an unknown field from a newer client — it is a field
// this build deliberately retired (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7
// Phase 11). Carrying it forward would re-run the consolidation against it on
// every load instead of once, and leave two answers on disk indefinitely.
describe("normalizeData retires the legacy work day", () => {
  it("takes the field off the record entirely", () => {
    const [task] = normalizeData({
      // Cast because the field is gone from `Task` — which is exactly the
      // shape this test is about: data written before it was retired.
      tasks: [{ id: "task-1", title: "Legacy", scheduledDate: "2026-08-19" } as Partial<Task>],
    }).tasks;
    expect("scheduledDate" in task).toBe(false);
  });

  it("keeps what the field meant, as the task's date", () => {
    const [task] = normalizeData({
      // Cast because the field is gone from `Task` — which is exactly the
      // shape this test is about: data written before it was retired.
      tasks: [{ id: "task-1", title: "Legacy", scheduledDate: "2026-08-19" } as Partial<Task>],
    }).tasks;
    expect(task.dueDate).toBe("2026-08-19");
  });

  // A work day and a deadline that disagreed become the range between them
  // (rule 1-d), so neither date is lost.
  it("turns a disagreeing pair into the range that covers both", () => {
    const [task] = normalizeData({
      tasks: [
        { id: "task-1", title: "Legacy", scheduledDate: "2026-08-17", dueDate: "2026-08-20" } as Partial<Task>,
      ],
    }).tasks;
    expect([task.startDate, task.dueDate]).toEqual(["2026-08-17", "2026-08-20"]);
  });

  it("is idempotent, since it runs on every load rather than once", () => {
    const once = normalizeData({
      tasks: [
        { id: "task-1", title: "Legacy", scheduledDate: "2026-08-17", dueDate: "2026-08-20" } as Partial<Task>,
      ],
    }).tasks;
    const twice = normalizeData({ tasks: once }).tasks;
    expect(twice).toEqual(once);
  });
});
