// @vitest-environment jsdom
//
// The content-mode control, where §11.4 puts it (TASK_CONTENT_MODE_DESIGN.md).
//
// What these pin is the split the design turns on: the ICON is the present
// tense and the LABEL is the future one. An icon is looked at rather than
// read, so it has to agree with what is on screen; the label is read, so it
// has to say what pressing does. Getting those the same way round is the
// whole of §5 in that document.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CheckItem, Task, TaskContentMode } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TaskDrawer } from "./TaskDrawer";

afterEach(cleanup);

const NOW = "2026-08-29T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write it down",
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

function tree(subject: Task, checkItems: CheckItem[], onSetContentMode: (mode: TaskContentMode) => void) {
  return (
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TaskDrawer
          task={subject}
          presentation="inline-drawer"
          lists={[]}
          folders={[]}
          tags={[]}
          taskTags={[]}
          onToggleTag={() => {}}
          children={[]}
          onClose={() => {}}
          onUpdate={() => {}}
          onComplete={() => {}}
          onMoveToList={() => {}}
          onSetPriority={() => {}}
          today="2026-08-29"
          onCommitSchedule={() => []}
          onAddSubtask={() => {}}
          onToggleSubtask={() => {}}
          onDeleteSubtask={() => {}}
          actions={[]}
          onRunAction={() => {}}
          reminders={[]}
          activity={null}
          onCloseActivity={() => {}}
          checkItems={checkItems}
          onSetContentMode={onSetContentMode}
          onAddCheckItem={() => {}}
          onAddCheckItems={() => {}}
          onRenameCheckItem={() => {}}
          onToggleCheckItem={() => {}}
          onDeleteCheckItem={() => {}}
          ancestors={[]}
          onOpenTask={() => {}}
          blockerOptions={[]}
          blocking={[]}
          canAddSubtask
          resize={{ width: 420, onPointerDown: () => {}, onKeyDown: () => {}, reset: () => {} } as never}
        />
      </FloatingLayerProvider>
    </I18nProvider>
  );
}

function setup(overrides: Partial<Task> = {}, checkItems: CheckItem[] = []) {
  const onSetContentMode = vi.fn();
  const { rerender } = render(tree(task(overrides), checkItems, onSetContentMode));
  // The Drawer is controlled: the toggle asks, the account answers, and the
  // task comes back in the other mode. `show` is that answer, so a test can
  // follow one conversion the whole way rather than stopping at the request.
  function show(next: Partial<Task>, nextItems: CheckItem[] = []) {
    rerender(tree(task({ ...overrides, ...next }), nextItems, onSetContentMode));
  }
  return { onSetContentMode, show };
}

describe("the content-mode toggle", () => {
  it("sits beside the title, not inside the body it changes", () => {
    setup();
    const row = screen.getByRole("textbox", { name: "Title" }).parentElement!;
    expect(row.querySelector(".tm-drawer-content-toggle")).toBeTruthy();
  });

  it("says what pressing it does, and carries the present in aria-pressed", () => {
    setup();
    const button = screen.getByRole("button", { name: "Turn into a checklist" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toBe("Turn into a checklist");
  });

  it("says the other thing once the content is the other thing", () => {
    setup({ contentMode: "checklist" });
    const button = screen.getByRole("button", { name: "Turn into notes" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Turn into a checklist" })).toBeNull();
  });

  it("asks for the mode it is not in", () => {
    const { onSetContentMode } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Turn into a checklist" }));
    expect(onSetContentMode).toHaveBeenCalledWith("checklist");
  });

  it("asks to come back the other way", () => {
    const { onSetContentMode } = setup({ contentMode: "checklist" });
    fireEvent.click(screen.getByRole("button", { name: "Turn into notes" }));
    expect(onSetContentMode).toHaveBeenCalledWith("description");
  });

  it("leaves one control, and no heading over the body at all", () => {
    // It used to say "Notes" twice on one line: once as the heading and once
    // as the button that was already pressed. §11.4 took one of them; §2 took
    // the heading itself, because the body's own placeholder already names the
    // field it is (TICKTICK_DETAIL_ANATOMY_DESIGN.md).
    setup();
    expect(screen.queryByRole("group", { name: "Content type" })).toBeNull();
    expect(document.querySelector(".tm-drawer-content-head")).toBeNull();
    // The word survives only as the toggle's own label.
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.getByRole("button", { name: "Turn into a checklist" })).toBeTruthy();
  });
});

// §11.6, and the Q4 this stage was opened for
describe("what an empty checklist says", () => {
  it("says nothing beside its heading — no 0/0", () => {
    // `progressOf` in the MCP projections refuses the same number for the
    // same reason: 0/0 reads as "no progress" where the truth is "no parts".
    // The Subtasks heading below has always hidden its own empty count.
    setup({ contentMode: "checklist" });
    const row = document.querySelector(".tm-drawer-title-row") as HTMLElement;
    expect(row.querySelector(".tm-count")).toBeNull();
  });

  it("counts once there is something to count", () => {
    setup({ contentMode: "checklist" }, [
      {
        id: "c1",
        taskId: "t1",
        text: "Prepare slides",
        checked: false,
        completedAt: "",
        sortKey: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    // Beside the title now, not over the body: the heading it used to sit in
    // went with §2, and this is the one thing that heading said.
    const row = document.querySelector(".tm-drawer-title-row") as HTMLElement;
    expect(row.querySelector(".tm-count")?.textContent).toBe("0/1");
  });

  it("puts the caret where the first item goes, after a conversion that left none", () => {
    // §11.6: an empty description becomes an empty checklist with no confirm
    // step. The reader pressed a button and the next thing to do is type.
    const { show } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Turn into a checklist" }));
    show({ contentMode: "checklist" });
    expect(document.activeElement).toBe(screen.getByLabelText("Add an item"));
  });

  it("leaves the caret alone for a checklist that was merely opened", () => {
    // Nothing was converted here — the task arrived in checklist mode, and
    // stealing focus from a Drawer someone just opened is not an answer to
    // anything they asked.
    setup({ contentMode: "checklist" });
    expect(document.activeElement).not.toBe(screen.getByLabelText("Add an item"));
  });

  it("leaves the caret alone when the description filled the list", () => {
    // The result is on screen; the empty row under it is not what to read.
    const { show } = setup({ description: "- Prepare slides" });
    fireEvent.click(screen.getByRole("button", { name: "Turn into a checklist" }));
    show({ contentMode: "checklist", description: "" }, [
      {
        id: "c1",
        taskId: "t1",
        text: "Prepare slides",
        checked: false,
        completedAt: "",
        sortKey: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Add an item"));
  });
});
