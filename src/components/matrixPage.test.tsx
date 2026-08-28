// @vitest-environment jsdom
//
// The grouping, as the screen actually assembles it. `matrixGroups.test.ts`
// proves the rule; this proves the box draws what the rule says — including
// the two things the rule cannot know about: the cap on finished work, and
// what happens to a card the moment it is ticked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { List, Task, TaskStatus } from "../types";
import { I18nProvider } from "../i18n";
import { MatrixPage } from "./MatrixPage";

const TODAY = "2026-08-28";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random().toString(16).slice(2)}`,
    title: "A task",
    status: "todo" as TaskStatus,
    priority: "high",
    dueDate: "",
    projectId: "",
    tags: [],
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "",
    ...overrides,
  } as Task;
}

const lists: List[] = [];

function renderMatrix(tasks: Task[], handlers: Partial<Parameters<typeof MatrixPage>[0]> = {}) {
  return render(
    <I18nProvider lang="en">
      <MatrixPage
        tasks={tasks}
        lists={lists}
        selectedTaskId=""
        onOpenTask={() => {}}
        onUpdateTask={() => {}}
        onCreateTask={() => ""}
        onToggleDone={() => {}}
        {...handlers}
      />
    </I18nProvider>,
  );
}

/** The Ⅰ box, which every task in these fixtures is high enough to land in. */
function boxOne(): HTMLElement {
  return document.querySelector(".ff-matrix-cell-I") as HTMLElement;
}

function groupNames(box: HTMLElement): string[] {
  return [...box.querySelectorAll(".ff-matrix-group-name")].map((node) => node.textContent ?? "");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("what a box is divided into", () => {
  it("groups by date, late first and undated last", () => {
    renderMatrix([
      task({ id: "later", dueDate: "2026-09-30" }),
      task({ id: "undated" }),
      task({ id: "late", dueDate: "2026-08-20" }),
      task({ id: "now", dueDate: TODAY }),
      task({ id: "soon", dueDate: "2026-08-29" }),
    ]);

    expect(groupNames(boxOne())).toEqual(["Overdue", "Today", "Tomorrow", "Later", "No date"]);
  });

  it("counts each group, and draws none that is empty", () => {
    renderMatrix([task({ dueDate: "2026-08-20" }), task({ dueDate: "2026-08-20" })]);

    const box = boxOne();
    expect(groupNames(box)).toEqual(["Overdue"]);
    expect(box.querySelector(".ff-matrix-group-count")?.textContent).toBe("2");
  });

  it("puts no count on the box itself", () => {
    // The group counts are the numbers that answer something. One number over
    // a box is a number the reader has to divide up by eye.
    renderMatrix([task({ dueDate: TODAY })]);
    expect(boxOne().querySelector(".ff-board-count")).toBeNull();
  });

  it("collapses a group and leaves its count on screen", async () => {
    renderMatrix([task({ title: "Write it up", dueDate: TODAY })]);

    const head = boxOne().querySelector(".ff-matrix-group-head") as HTMLElement;
    expect(head.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(head);

    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(within(boxOne()).queryByText("Write it up")).toBeNull();
    expect(boxOne().querySelector(".ff-matrix-group-count")?.textContent).toBe("1");
  });
});

describe("finished work", () => {
  const done = (id: string, completedAt: string) =>
    task({ id, title: id, status: "completed" as TaskStatus, completedAt, dueDate: "2026-08-01" });

  it("stays in the box its priority names, under its own group", () => {
    // D2. It used to be filtered off the screen entirely.
    renderMatrix([done("finished", "2026-08-27T09:00:00.000Z"), task({ id: "open", dueDate: TODAY })]);

    expect(groupNames(boxOne())).toEqual(["Today", "Completed"]);
    expect(within(boxOne()).getByText("finished")).toBeTruthy();
  });

  it("shows five, then offers the rest", () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      done(`done-${index}`, `2026-08-2${index}T09:00:00.000Z`),
    );
    renderMatrix(tasks);

    const box = boxOne();
    expect(box.querySelectorAll(".ff-matrix-card")).toHaveLength(5);
    expect(box.querySelector(".ff-matrix-group-count")?.textContent).toBe("8");
    expect(box.querySelector(".ff-matrix-group-more")).toBeTruthy();
  });

  it("shows the rest when asked, and stops offering", async () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      done(`done-${index}`, `2026-08-2${index}T09:00:00.000Z`),
    );
    renderMatrix(tasks);

    await userEvent.click(boxOne().querySelector(".ff-matrix-group-more") as HTMLElement);

    expect(boxOne().querySelectorAll(".ff-matrix-card")).toHaveLength(8);
    expect(boxOne().querySelector(".ff-matrix-group-more")).toBeNull();
  });

  it("puts what was finished most recently first", () => {
    // With a cap of five, an old-first order would hide the task the reader
    // just ticked — which is the one they are looking for.
    renderMatrix([
      done("oldest", "2026-08-01T09:00:00.000Z"),
      done("newest", "2026-08-28T08:00:00.000Z"),
      done("middle", "2026-08-14T09:00:00.000Z"),
    ]);

    const titles = [...boxOne().querySelectorAll(".ff-matrix-card-title")].map((node) => node.textContent);
    expect(titles).toEqual(["newest", "middle", "oldest"]);
  });
});

describe("ticking a card", () => {
  it("asks to toggle rather than deciding anything itself", async () => {
    const onToggleDone = vi.fn();
    renderMatrix([task({ id: "t1", title: "Write it up", dueDate: TODAY })], { onToggleDone });

    await userEvent.click(boxOne().querySelector(".ff-check") as HTMLElement);
    expect(onToggleDone).toHaveBeenCalledWith("t1");
  });

  it("moves the card into the same box's completed group once the record says so", () => {
    // The screen is a function of the records: the check hands the change up,
    // and the task comes back finished. What matters is where it lands — the
    // box it was already in, not somewhere the reader has to go looking.
    const { rerender } = renderMatrix([task({ id: "t1", title: "Write it up", dueDate: TODAY })]);
    expect(groupNames(boxOne())).toEqual(["Today"]);

    rerender(
      <I18nProvider lang="en">
        <MatrixPage
          tasks={[
            task({
              id: "t1",
              title: "Write it up",
              dueDate: TODAY,
              status: "completed" as TaskStatus,
              completedAt: `${TODAY}T09:00:00.000Z`,
            }),
          ]}
          lists={lists}
          selectedTaskId=""
          onOpenTask={() => {}}
          onUpdateTask={() => {}}
          onCreateTask={() => ""}
          onToggleDone={() => {}}
        />
      </I18nProvider>,
    );

    expect(groupNames(boxOne())).toEqual(["Completed"]);
    expect(within(boxOne()).getByText("Write it up")).toBeTruthy();
  });
});
