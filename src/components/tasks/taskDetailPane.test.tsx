// @vitest-environment jsdom
//
// The Detail, assembled by something that is not the Tasks module
// (TASK_DETAIL_PANEL_MERGE_DESIGN.md §5).
//
// That sentence is the whole point of the file. Phase 1 made the Drawer a
// superset of the legacy panel's fields; what still made the legacy panel
// necessary was that the four pages App.tsx owns could not BUILD a Drawer —
// the derivations and the command switch lived inside `TasksModule`. So the
// harness here is deliberately hand-rolled: a bundle, a `useTaskCommands`, a
// presentation and a width, and nothing from the Module at all. If this file
// compiles and passes, App.tsx can do the same thing.
//
// What it pins is therefore not the Drawer's markup — `detailShell` and
// `taskDetailBody` already do that — but the JOINTS: that the derived props
// arrive derived, and that a change made in the panel comes back through the
// same command path with its undo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CheckItem, List, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { useTaskCommands } from "../../hooks/useTaskCommands";
import { useTaskDetailWidth } from "../../hooks/useTaskDetailWidth";
import type { TaskDetailBundle } from "./taskDetailBundle";
import { TaskDetailPane } from "./TaskDetailPane";
import { TaskUndoStrip } from "./TaskUndoStrip";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NOW = "2026-08-31T00:00:00.000Z";

const inbox: List = {
  id: "list-inbox",
  projectId: "",
  kind: "inbox",
  name: "Inbox",
  order: -1,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Ship it",
    description: "",
    status: "todo",
    priority: "none",
    listId: inbox.id,
    parentTaskId: "",
    projectId: "",
    tags: [],
    notes: "",
    blockedByTaskId: "",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Task;
}

/**
 * A bundle assembled by hand — the part App.tsx already has.
 *
 * Every callback is a spy so a test can say which one a control reached, and
 * the collections are the plain arrays a page would hand over.
 */
function bundleFor(checkItems: CheckItem[] = []) {
  const spies = {
    onUpdate: vi.fn(),
    onMoveToList: vi.fn(),
    onToggleTag: vi.fn(),
    onAddSubtask: vi.fn(),
    onSetContentMode: vi.fn(),
  };
  const bundle: TaskDetailBundle = {
    childrenOf: () => [],
    onUpdate: spies.onUpdate,
    onMoveToList: spies.onMoveToList,
    onCommitSchedule: () => [],
    onToggleTag: spies.onToggleTag,
    onAddSubtask: spies.onAddSubtask,
    onToggleSubtask: () => {},
    onDeleteSubtask: () => {},
    checkItemsFor: () => checkItems,
    onSetContentMode: spies.onSetContentMode,
    onAddCheckItem: () => {},
    onAddCheckItems: () => {},
    onRenameCheckItem: () => {},
    onToggleCheckItem: () => {},
    onDeleteCheckItem: () => {},
    activityFor: () => [{ id: "a1", kind: "created", at: NOW }],
    remindersFor: () => [],
  };
  return { bundle, spies };
}

/**
 * Everything a page would have to write to open this panel. Roughly twenty
 * lines, which is the claim §5 makes about what phase 3 costs per page.
 */
function Harness({
  tasks,
  openId,
  onMutate,
  bundle,
  onOpenTask = () => {},
  onClose = () => {},
}: {
  tasks: Task[];
  openId: string;
  onMutate: (taskId: string, patch: Partial<Task>) => void;
  bundle: TaskDetailBundle;
  onOpenTask?: (taskId: string) => void;
  onClose?: () => void;
}) {
  const resize = useTaskDetailWidth();
  const commands = useTaskCommands({
    tasks,
    focusBusy: false,
    onMutate,
    onDuplicate: () => null,
    onSaveAsTemplate: () => "",
    onDeleteTemplate: () => {},
    onDeleteForever: () => {},
    onStartFocus: () => {},
    linkFor: (taskId) => `https://example.test/#${taskId}`,
  });
  const open = tasks.find((row) => row.id === openId);
  if (!open) return null;
  return (
    <>
      <TaskDetailPane
        task={open}
        presentation="inline-drawer"
        resize={resize}
        today="2026-08-31"
        tasks={tasks}
        lists={[inbox]}
        folders={[]}
        tags={[]}
        taskTags={[]}
        bundle={bundle}
        commands={commands}
        focusBusy={false}
        onClose={onClose}
        onOpenTask={onOpenTask}
      />
      <TaskUndoStrip notice={commands.notice} onDismiss={() => commands.setNotice(null)} />
      {/* Stands in for the ⋯ menu, which is a popover of its own and not what
          this file is about: what matters is that an action run from OUTSIDE
          the panel lands in the same command state the panel reads. */}
      <button type="button" onClick={() => commands.runTaskAction(open, "activities")}>
        run activities
      </button>
    </>
  );
}

function renderPane(props: Parameters<typeof Harness>[0]) {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <Harness {...props} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
}

describe("the Detail, opened by a surface that is not the Tasks module", () => {
  it("draws the Task from a bundle and nothing else", () => {
    const { bundle } = bundleFor();
    renderPane({ tasks: [task()], openId: "t1", onMutate: vi.fn(), bundle });

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Ship it");
    expect(screen.getByLabelText("Description")).toBeTruthy();
    // §2: a Task with no note, no blocker, no subtask and no tag draws none of
    // them. "Nothing else" is meant literally now — the four sections and the
    // three property rows that stood here are what the reference app does not
    // have (TICKTICK_DETAIL_ANATOMY_DESIGN.md).
    expect(screen.queryByLabelText("Notes")).toBeNull();
    expect(screen.queryByLabelText("Waiting on")).toBeNull();
    expect(screen.queryByText("Subtasks")).toBeNull();
    // The List did not go away — it moved to the footer, where the reference
    // app draws it.
    expect(document.querySelector(".tm-drawer-foot .tm-list-trigger")).toBeTruthy();
  });

  it("completes through the command path, with the undo beside it", () => {
    const onMutate = vi.fn();
    const { bundle } = bundleFor();
    renderPane({ tasks: [task()], openId: "t1", onMutate, bundle });

    fireEvent.click(screen.getByRole("checkbox", { name: "Done" }));

    // The patch is the domain's, not the panel's — all the pane knows is that
    // it went through `commands.mutate`.
    expect(onMutate).toHaveBeenCalledTimes(1);
    expect(onMutate.mock.calls[0][0]).toBe("t1");
    expect(onMutate.mock.calls[0][1].status).toBe("completed");

    // And the way back is on screen, which is the half that lived in the
    // Module until the strip became a component.
    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    expect(onMutate).toHaveBeenCalledTimes(2);
    expect(onMutate.mock.calls[1][1].status).not.toBe("completed");
  });

  it("derives the breadcrumb, the blockers and the dependents from the Tasks it is given", () => {
    const parent = task({ id: "p1", title: "Release" });
    // Waiting on its own parent, so the picker is drawn at all: since §2.4 the
    // dependency section shows the select only for a Task that IS waiting on
    // something, and the reverse list for one that has others waiting on it.
    const child = task({ id: "t1", parentTaskId: "p1", blockedByTaskId: "p1" });
    const dependent = task({ id: "d1", title: "Announce it", blockedByTaskId: "t1" });
    const { bundle } = bundleFor();
    const onOpenTask = vi.fn();
    renderPane({ tasks: [parent, child, dependent], openId: "t1", onMutate: vi.fn(), bundle, onOpenTask });

    // §12.7's way back up. The breadcrumb button, not the blocker's name in
    // the select — `getAllByRole` because both now say "Release".
    fireEvent.click(screen.getAllByRole("button", { name: "Release" })[0]);
    expect(onOpenTask).toHaveBeenCalledWith("p1");

    // The reverse dependency, and the eligible blockers — neither of which the
    // Drawer works out for itself.
    fireEvent.click(screen.getByRole("button", { name: "Announce it" }));
    expect(onOpenTask).toHaveBeenCalledWith("d1");

    const options = [...(screen.getByLabelText("Waiting on") as HTMLSelectElement).options].map(
      (option) => option.textContent,
    );
    // "Release" is the parent and still eligible; "Announce it" would close a
    // loop, so `blockerChoices` refuses it.
    expect(options).toContain("Release");
    expect(options).not.toContain("Announce it");
  });

  it("shares its activity state with whatever ran the action", () => {
    const { bundle } = bundleFor();
    renderPane({ tasks: [task()], openId: "t1", onMutate: vi.fn(), bundle });

    expect(screen.queryByRole("heading", { name: "Task activities" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "run activities" }));
    expect(screen.getByRole("heading", { name: "Task activities" })).toBeTruthy();
  });
});
