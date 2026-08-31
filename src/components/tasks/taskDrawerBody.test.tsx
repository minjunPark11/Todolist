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
          actions={[]}
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
  it("gives the prose body and the notes field different names", () => {
    renderDrawer();
    // Not the same word twice. The description heading said "Notes" until the
    // notes field arrived under it, at which point the panel had two.
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
  });

  it("writes the notes box to `notes` and the body box to `description`", () => {
    const onUpdate = vi.fn();
    renderDrawer({}, { onUpdate });

    const body = screen.getByLabelText("Description") as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "why this matters" } });
    fireEvent.blur(body);
    expect(onUpdate).toHaveBeenCalledWith({ description: "why this matters" });

    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: "room 3" } });
    fireEvent.blur(notes);
    expect(onUpdate).toHaveBeenCalledWith({ notes: "room 3" });
  });

  it("shows what was typed into notes elsewhere", () => {
    // The whole point of §4: a note written on the Today page is READ here.
    renderDrawer({ notes: "bring the laptop" });
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("bring the laptop");
  });
});

describe("the Drawer's dependency row", () => {
  it("sets a blocker from the offered choices", () => {
    const onUpdate = vi.fn();
    renderDrawer({}, { onUpdate, blockerOptions: [{ id: "t2", title: "Get approval" }] });

    const select = screen.getByLabelText("Waiting on") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "t2" } });
    expect(onUpdate).toHaveBeenCalledWith({ blockedByTaskId: "t2" });
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
    renderDrawer();
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
