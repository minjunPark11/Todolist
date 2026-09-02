// @vitest-environment jsdom
//
// The Drawer's body, after §4 gave it the two things only the legacy panel had.
//
// What these pin is the pair of confusions the merge design found, and not the
// markup around them:
//
//   1. `notes` and `description` are two columns on Task, and both panels drew
//      a box headed "Notes" (§3). The heading has to name the field, and the
//      box under each heading has to write the field it names — a test that
//      only checked the words would pass a Drawer whose Notes box wrote
//      `description`.
//   2. The dependency row existed on the Today page and nowhere else (§4), so
//      the field could be set where the Tasks module could not clear it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "../../types";
import { taskActions } from "../../domain/tasks/actions";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TaskDrawer } from "./TaskDrawer";

afterEach(cleanup);

const NOW = "2026-08-31T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Ship it",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    listId: "list-inbox",
    parentTaskId: "",
    tags: [],
    notes: "",
    blockedByTaskId: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Task;
}

function renderDrawer(
  overrides: Partial<Task> = {},
  props: {
    onUpdate?: (patch: Partial<Task>) => void;
    onOpenTask?: (taskId: string) => void;
    blockerOptions?: Array<{ id: string; title: string }>;
    blocking?: Array<{ id: string; title: string }>;
  } = {},
) {
  const noop = () => {};
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TaskDrawer
          task={task(overrides)}
          presentation="inline-drawer"
          lists={[]}
          folders={[]}
          tags={[]}
          taskTags={[]}
          onToggleTag={noop}
          children={[]}
          onClose={noop}
          onUpdate={props.onUpdate ?? noop}
          onComplete={noop}
          onMoveToList={noop}
          onSetPriority={noop}
          today="2026-08-31"
          onCommitSchedule={() => []}
          onAddSubtask={noop}
          onToggleSubtask={noop}
          onDeleteSubtask={noop}
          actions={taskActions({ task: task(overrides), surface: "detail" })}
          onRunAction={noop}
          reminders={[]}
          activity={null}
          onCloseActivity={noop}
          checkItems={[]}
          onSetContentMode={noop}
          onAddCheckItem={noop}
          onAddCheckItems={noop}
          onRenameCheckItem={noop}
          onToggleCheckItem={noop}
          onDeleteCheckItem={noop}
          ancestors={[]}
          onOpenTask={props.onOpenTask ?? noop}
          blockerOptions={props.blockerOptions ?? []}
          blocking={props.blocking ?? []}
          canAddSubtask
          resize={{ width: 420, isResizing: false } as never}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
}

describe("the Drawer's two bodies", () => {
  it("draws the prose body and nothing over it", () => {
    renderDrawer();
    // §2 took the heading: the placeholder already names the field, and a
    // second word for it was the thing that made "Notes" mean two fields.
    expect(screen.getByLabelText("Description")).toBeTruthy();
    expect(screen.queryByText("Description")).toBeNull();
  });

  it("keeps the notes field out of a Task that has no note", () => {
    // The rule the whole body follows now: a section appears because the Task
    // uses it, not because the field exists.
    renderDrawer();
    expect(screen.queryByLabelText("Notes")).toBeNull();
  });

  it("shows what was typed into notes elsewhere", () => {
    // §4's point survives §2: a note written on the Today page is READ here.
    renderDrawer({ notes: "bring the laptop" });
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("bring the laptop");
  });

  it("writes the notes box to `notes` and the body box to `description`", () => {
    const onUpdate = vi.fn();
    renderDrawer({ notes: "room 3" }, { onUpdate });

    const body = screen.getByLabelText("Description") as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "why this matters" } });
    fireEvent.blur(body);
    expect(onUpdate).toHaveBeenCalledWith({ description: "why this matters" });

    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: "room 4" } });
    fireEvent.blur(notes);
    expect(onUpdate).toHaveBeenCalledWith({ notes: "room 4" });
  });
});

/**
 * §2's rule, which is the whole shape of the new body: a section is drawn
 * because the Task uses it, and the ⋯ is how a Task starts using one.
 *
 * These are the tests that would catch the obvious wrong fix — hiding the
 * fields and leaving no way to reach them.
 */
describe("the sections a Task has to ask for", () => {
  function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "More" }));
  }

  it("offers the four in the menu, before everything else", () => {
    renderDrawer();
    openMenu();
    const rows = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(rows.slice(0, 4)).toEqual(["Add a subtask", "Tags", "Waiting on", "Notes"]);
  });

  it("opens the note field, and puts the caret in it", () => {
    renderDrawer();
    expect(screen.queryByLabelText("Notes")).toBeNull();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Notes" }));

    const notes = screen.getByLabelText("Notes");
    expect(notes).toBeTruthy();
    expect(document.activeElement).toBe(notes);
  });

  it("opens the dependency section", () => {
    renderDrawer({}, { blockerOptions: [{ id: "t2", title: "Get approval" }] });
    expect(screen.queryByLabelText("Waiting on")).toBeNull();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Waiting on" }));
    expect(screen.getByLabelText("Waiting on")).toBeTruthy();
  });

  it("opens the subtask form", () => {
    renderDrawer();
    expect(screen.queryByLabelText("Add a subtask")).toBeNull();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a subtask" }));
    expect(screen.getByLabelText("Add a subtask")).toBeTruthy();
  });
});

describe("the Drawer's dependency section", () => {
  it("is absent from a Task that waits on nothing", () => {
    renderDrawer({}, { blockerOptions: [{ id: "t2", title: "Get approval" }] });
    expect(screen.queryByLabelText("Waiting on")).toBeNull();
  });

  it("changes a blocker that is already set", () => {
    const onUpdate = vi.fn();
    renderDrawer(
      { blockedByTaskId: "t2" },
      {
        onUpdate,
        blockerOptions: [
          { id: "t2", title: "Get approval" },
          { id: "t3", title: "Book the room" },
        ],
      },
    );

    const select = screen.getByLabelText("Waiting on") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "t3" } });
    expect(onUpdate).toHaveBeenCalledWith({ blockedByTaskId: "t3" });
  });

  it("clears one back to nothing", () => {
    const onUpdate = vi.fn();
    renderDrawer(
      { blockedByTaskId: "t2" },
      { onUpdate, blockerOptions: [{ id: "t2", title: "Get approval" }] },
    );

    const select = screen.getByLabelText("Waiting on") as HTMLSelectElement;
    expect(select.value).toBe("t2");
    fireEvent.change(select, { target: { value: "" } });
    expect(onUpdate).toHaveBeenCalledWith({ blockedByTaskId: "" });
  });

  it("explains the demotion only while something is blocking", () => {
    // The section is open here because something waits on this Task, and the
    // hint is still absent because this Task waits on nothing.
    renderDrawer({}, { blocking: [{ id: "t9", title: "Announce it" }] });
    expect(screen.queryByText(/cannot start until/)).toBeNull();

    cleanup();
    renderDrawer({ blockedByTaskId: "t2" }, { blockerOptions: [{ id: "t2", title: "Get approval" }] });
    expect(screen.getByText(/cannot start until/)).toBeTruthy();
  });

  it("opens what is waiting on this one", () => {
    const onOpenTask = vi.fn();
    renderDrawer({}, { onOpenTask, blocking: [{ id: "t9", title: "Announce it" }] });

    fireEvent.click(screen.getByRole("button", { name: "Announce it" }));
    expect(onOpenTask).toHaveBeenCalledWith("t9");
  });

  it("draws no reverse list when nothing waits on it", () => {
    renderDrawer();
    expect(screen.queryByText("Waiting on this")).toBeNull();
  });
});

// TRASH_PERMANENT_DELETE_DESIGN.md §14 (Q1). A Task in the Trash is frozen in
// what it IS and not in what it says.
describe("the Detail of a Task that is in the Trash", () => {
  const NOW = "2026-08-31T09:00:00.000Z";

  /** The header's Complete control, which has no accessible name of its own. */
  const doneBox = () =>
    document.querySelector(".tm-drawer-done input") as HTMLInputElement;

  it("freezes the four that change what the Task is", () => {
    renderDrawer({ deletedAt: NOW, dueDate: "2026-08-20", priority: "high" });

    // Completion is the one that was actually broken: `completedAt` beside
    // `deletedAt` is a pair no Scope shows, and it handed back a DONE task on
    // restore.
    expect(doneBox().disabled).toBe(true);
    // The two pickers keep their words and lose their door — a reader deciding
    // whether to restore has to be able to READ the date.
    expect(document.querySelector("button.sched-trigger")).toBeNull();
    expect(document.querySelector("span.sched-trigger.is-readonly")).toBeTruthy();
    expect(document.querySelector("button.tm-priority-trigger")).toBeNull();
    expect(document.querySelector("span.tm-priority-trigger.is-readonly")).toBeTruthy();
    // Turning a note into a checklist rewrites the body's shape, which is the
    // same kind of change and not the typo fix the text is left open for.
    expect(document.querySelector(".tm-drawer-content-toggle")).toBeNull();
  });

  it("leaves the words alone", () => {
    renderDrawer({ deletedAt: NOW });

    expect((screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).disabled).toBe(false);
    expect(
      (screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).disabled,
    ).toBe(false);
  });

  // The freeze is the Trash's and nowhere else's: an ordinary Task keeps every
  // one of them.
  it("does none of this to a Task that is not deleted", () => {
    renderDrawer({ dueDate: "2026-08-20", priority: "high" });

    expect(doneBox().disabled).toBe(false);
    expect(document.querySelector("button.sched-trigger")).toBeTruthy();
    expect(document.querySelector("button.tm-priority-trigger")).toBeTruthy();
    expect(document.querySelector(".tm-drawer-content-toggle")).toBeTruthy();
    expect(document.querySelectorAll(".is-readonly")).toHaveLength(0);
  });

  // §14: nothing at all where there is nothing to report, rather than a chip
  // that cannot be clicked standing in for a value nobody set.
  it("draws no chip for a schedule or a priority that was never set", () => {
    renderDrawer({ deletedAt: NOW, dueDate: "", priority: "none" });

    expect(document.querySelector(".sched-trigger")).toBeNull();
    expect(document.querySelector(".tm-priority-trigger")).toBeNull();
  });
});
