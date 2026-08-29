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
import type { CheckItem, Task } from "../../types";
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

function setup(overrides: Partial<Task> = {}, checkItems: CheckItem[] = []) {
  const onSetContentMode = vi.fn();
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
          canAddSubtask
          resize={{ width: 420, onPointerDown: () => {}, onKeyDown: () => {}, reset: () => {} } as never}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onSetContentMode };
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

  it("leaves one control, not two — the segmented pair is gone", () => {
    // It used to say "Notes" twice on one line: once as the heading and once
    // as the button that was already pressed.
    setup();
    expect(screen.queryByRole("group", { name: "Content type" })).toBeNull();
    expect(screen.getAllByText("Notes")).toHaveLength(1);
  });
});
