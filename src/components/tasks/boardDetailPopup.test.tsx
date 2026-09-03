// @vitest-environment jsdom
//
// The Board opens a Task in a centred popup, not a column
// (BOARD_TASK_POPUP_DESIGN.md §4, §5).
//
// Rendered through `TasksModule` rather than the Drawer alone, because the
// thing worth protecting is the WIRING: the registry now takes a surface as
// well as a width, and the Module is the only caller that passes one. A test
// against `TaskDrawer` would keep passing if that argument were dropped.
//
// No pixels here — jsdom computes no layout, so "centred" and "720 wide" are
// the stylesheet's and e2e's. What is checkable is which presentation the
// Module chose, that the popup has a parent to be centred in, and what a click
// on that parent does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { List, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TasksModule } from "./TasksModule";

const TODAY = "2026-09-03";

afterEach(cleanup);

function task(id: string, title: string, listId: string): Task {
  return {
    id,
    title,
    status: "todo",
    priority: "none",
    dueDate: TODAY,
    listId,
    sectionId: "",
    projectId: "",
    tags: [],
    notes: "",
    order: 0,
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
    completedAt: "",
  } as unknown as Task;
}

const lists: List[] = [
  {
    id: "list-home",
    name: "Home",
    order: 0,
    projectId: "",
    kind: "regular",
    isDefault: false,
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
  } as unknown as List,
];

const tasks = [task("t1", "Write it up", "list-home")];

function renderModule(url: string) {
  const onNavigate = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TasksModule
          tasks={tasks}
          lists={lists}
          folders={[]}
          sidebarFolders={[]}
          savedFilters={[]}
          listSections={[]}
          dailyPlans={[]}
          tags={[]}
          taskTags={[]}
          today={TODAY}
          url={url}
          onNavigate={onNavigate}
          onStartFocus={() => {}}
          onDeleteForever={() => {}}
          onEmptyTrash={() => ({ tasks: 0, lists: 0, tasksWithLists: 0 })}
          onSetScopeViewOptions={() => {}}
          onDuplicate={() => null}
          focusBusy={false}
          onCreate={() => {}}
          draftTitle=""
          onDraftConsumed={() => {}}
          onCreateList={() => "list-new"}
          onCreateSidebarFolder={() => "sf-new"}
          drawer={{
            childrenOf: () => [],
            onUpdate: () => {},
            onMoveToList: () => {},
            onCommitSchedule: () => [],
            onToggleTag: () => {},
            onAddSubtask: () => {},
            onToggleSubtask: () => {},
            onDeleteSubtask: () => {},
            checkItemsFor: () => [],
            onSetContentMode: () => {},
            onAddCheckItem: () => {},
            onAddCheckItems: () => {},
            onRenameCheckItem: () => {},
            onToggleCheckItem: () => {},
            onDeleteCheckItem: () => {},
            activityFor: () => [],
            remindersFor: () => [],
          }}
          lifecycle={{
            onTrashList: () => {},
            onRestoreList: () => {},
            onPermanentlyDeleteList: () => {},
          }}
          onSaveAsTemplate={() => "tpl-1"}
          onDeleteTemplate={() => {}}
          templates={[]}
          onUseTemplate={() => {}}
          onMutate={() => {}}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onNavigate };
}

const scrim = () => document.querySelector(".tm-drawer-scrim");
const pane = () => document.querySelector(".tm-drawer") as HTMLElement;

// jsdom reports 1024px, which is `compactDesktop` — so the List's answer here
// is the overlay drawer. That is the comparison the Board is being measured
// against: same width, same Task, different surface.
describe("a Task opened from the Board", () => {
  it("is a centred popup rather than a drawer", () => {
    renderModule("/today?view=board&task=t1");

    expect(pane().classList.contains("is-center-modal")).toBe(true);
    expect(pane().classList.contains("is-overlay-drawer")).toBe(false);
  });

  it("is a dialog, and sits inside the scrim that centres it", () => {
    renderModule("/today?view=board&task=t1");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBe(pane());
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.parentElement).toBe(scrim());
  });

  // §7: the popup is not resizable, for the reason the sheet is not — its
  // width is the screen's, so a drag would offer a change it cannot make.
  it("offers no resize handle", () => {
    renderModule("/today?view=board&task=t1");

    expect(screen.queryByRole("separator", { name: "Resize the task detail" })).toBeNull();
  });

  // TASK_PRIORITY_CHECKBOX_DESIGN.md §5. The × goes because the scrim is
  // already a way out for a pointer — and the corner it was holding is where
  // the flag now stands.
  it("drops the close button, which the scrim has made redundant", () => {
    renderModule("/today?view=board&task=t1");

    expect(pane().querySelector(".tm-drawer-close")).toBeNull();
  });

  // §5.2. Every field is a draft that flushes on unmount, and Escape already
  // closes by this same path, so there is nothing for the gesture to lose.
  it("closes when the scrim is pressed", () => {
    const { onNavigate } = renderModule("/today?view=board&task=t1");

    fireEvent.mouseDown(scrim()!);

    expect(onNavigate).toHaveBeenCalledWith("/today?view=board");
  });

  it("stays open when the press lands on the popup itself", () => {
    const { onNavigate } = renderModule("/today?view=board&task=t1");

    // The same event, one element in. A press that bubbles up from the pane
    // is a press INSIDE the popup — selecting text, aiming at a control —
    // and dismissing on it would close the panel the user is working in.
    fireEvent.mouseDown(pane());

    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("the same Task opened from the list", () => {
  it("keeps the presentation it had (§7)", () => {
    renderModule("/today?task=t1");

    expect(pane().classList.contains("is-overlay-drawer")).toBe(true);
    expect(pane().classList.contains("is-center-modal")).toBe(false);
  });

  it("draws no scrim and claims no dialog role", () => {
    renderModule("/today?task=t1");

    expect(scrim()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The other half of §5: with no scrim to press, the × is the only way out
  // for a pointer, so it stays.
  it("keeps its close button", () => {
    renderModule("/today?task=t1");

    expect(pane().querySelector(".tm-drawer-close")).not.toBeNull();
  });
});
