// @vitest-environment jsdom
//
// The older detail panel and a task whose body is a checklist
// (TASK_CONTENT_MODE_DESIGN.md §11).
//
// This app has two detail panels. The Tasks Drawer knows about `contentMode`;
// this one, which the Today, Calendar and Project pages open, did not — it
// offered its Description editor for every task. For a checklist task that
// field is not the body: the Drawer never draws it, and the next toggle back
// to prose overwrites it with `descriptionFromCheckItems`. Typing here was
// invisible and then gone, which is the one thing §11.7 forbids.
//
// What these fix is that the panel draws the body it actually has, and offers
// no editor for a field this task does not use.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CheckItem, Task } from "../types";
import { I18nProvider } from "../i18n";
import { FloatingLayerProvider } from "./floating";
import { TaskDetail } from "./TaskDetail";

afterEach(cleanup);

const NOW = "2026-08-31T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Standup",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    listId: "list-inbox",
    tags: [],
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Task;
}

function item(id: string, text: string, checked = false): CheckItem {
  return {
    id,
    taskId: "t1",
    text,
    checked,
    completedAt: checked ? NOW : "",
    sortKey: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function setup(subject: Task, checkItems: CheckItem[] = []) {
  const onUpdateTask = vi.fn();
  const checklist = {
    onAddCheckItem: vi.fn(),
    onAddCheckItems: vi.fn(),
    onRenameCheckItem: vi.fn(),
    onToggleCheckItem: vi.fn(),
    onDeleteCheckItem: vi.fn(),
  };
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TaskDetail
          task={subject}
          reminders={[]}
          tasks={[subject]}
          lists={[]}
          subtasks={[]}
          checkItems={checkItems}
          {...checklist}
          onMoveToList={() => {}}
          onUpdateTask={onUpdateTask}
          onUpdateTaskSchedule={() => []}
          onRequestDeleteTask={() => {}}
          onArchiveTask={() => {}}
          onDuplicateTask={() => {}}
          onAddSubtask={() => {}}
          onToggleSubtask={() => {}}
          onDeleteSubtask={() => {}}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onUpdateTask, ...checklist };
}

describe("the older panel, on a task whose body is a checklist", () => {
  it("offers no Description editor for a field this task does not use", () => {
    setup(task({ contentMode: "checklist" }), [item("c1", "Yesterday", true)]);

    expect(screen.queryByLabelText("Task description")).toBeNull();
  });

  it("still offers one where the body IS the description", () => {
    setup(task());

    expect(screen.getByLabelText("Task description")).toBeTruthy();
  });

  it("draws the checklist instead, ticks and all", () => {
    setup(task({ contentMode: "checklist" }), [
      item("c1", "Yesterday", true),
      item("c2", "Blockers"),
    ]);

    expect(screen.getByDisplayValue("Yesterday")).toBeTruthy();
    expect(screen.getByDisplayValue("Blockers")).toBeTruthy();
    // The tick is a state of the line, so it is on the line rather than in a
    // separate legend the reader has to match up.
    expect(screen.getByDisplayValue("Yesterday").closest("li")?.className).toContain("is-checked");
    expect(screen.getByDisplayValue("Blockers").closest("li")?.className).not.toContain("is-checked");
  });

  it("lets a line be ticked from here, which is the whole point of drawing it", () => {
    // The read-only version of this panel could show the body and not touch
    // it — "tick it in the other panel" is not something a reader on the
    // Today page can act on (§12).
    const { onToggleCheckItem } = setup(task({ contentMode: "checklist" }), [item("c1", "Yesterday")]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Yesterday" }));
    expect(onToggleCheckItem).toHaveBeenCalledWith("c1");
  });

  it("adds a line to the task it is open on", () => {
    const { onAddCheckItem } = setup(task({ contentMode: "checklist" }), []);

    const draft = screen.getByLabelText("Add an item");
    fireEvent.change(draft, { target: { value: "Blockers" } });
    fireEvent.keyDown(draft, { key: "Enter" });

    expect(onAddCheckItem).toHaveBeenCalledWith("t1", "Blockers");
  });

  it("leaves Notes alone — that field is this panel's own and means what it did", () => {
    // §7 Q1 asked whether `notes` should become the checklist's heading. It
    // cannot: this panel has always edited it as a memo, under the same word
    // the Drawer gives `description`.
    setup(task({ contentMode: "checklist", notes: "ask about the deploy window" }));

    expect(screen.getByDisplayValue("ask about the deploy window")).toBeTruthy();
  });
});
