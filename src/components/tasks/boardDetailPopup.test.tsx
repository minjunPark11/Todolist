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
          onMutate={() => {}}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onNavigate };
}

const pane = () => document.querySelector(".tm-drawer") as HTMLElement;

// jsdom reports 1024px, which is `compactDesktop` — so the List's answer here
// is the overlay drawer. That is the comparison the Board is being measured
// against: same width, same Task, different surface.
describe("a Task opened from the Board", () => {
  it("is a popup rather than a drawer", () => {
    renderModule("/today?view=board&task=t1");

    expect(pane().classList.contains("is-anchored-popover")).toBe(true);
    expect(pane().classList.contains("is-overlay-drawer")).toBe(false);
  });

  // CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §3.2: a dialog, and NOT a modal
  // one. It dims nothing and traps nothing, so claiming `aria-modal` would be
  // telling a screen reader the rest of the page had gone inert when it has
  // not — and there is no scrim to be a parent of.
  it("is a dialog, but not a modal one, and has no scrim", () => {
    renderModule("/today?view=board&task=t1");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBe(pane());
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(document.querySelector(".tm-drawer-scrim")).toBeNull();
  });

  // §7: the popup is not resizable, for the reason the sheet is not — its
  // width is the screen's, so a drag would offer a change it cannot make.
  it("offers no resize handle", () => {
    renderModule("/today?view=board&task=t1");

    expect(screen.queryByRole("separator", { name: "Resize the task detail" })).toBeNull();
  });

  // §3.2 reverses TASK_PRIORITY_CHECKBOX_DESIGN.md §5: the × went because the
  // scrim was another way out for a pointer, and the scrim is gone. What is
  // left outside the popup is the page itself, and pressing the page to close
  // a panel is also how you press something you did not mean to.
  it("keeps its close button, now that there is no scrim", () => {
    renderModule("/today?view=board&task=t1");

    expect(pane().querySelector(".tm-drawer-close")).not.toBeNull();
  });

  // §3.2. Every field is a draft that flushes on unmount, and Escape already
  // closes by this same path, so there is nothing for the gesture to lose.
  it("closes when the press lands outside it", async () => {
    const { onNavigate } = renderModule("/today?view=board&task=t1");

    // The listener is added a frame late on purpose — the click that OPENED
    // the popup is still being dispatched when it mounts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.mouseDown(document.body);

    expect(onNavigate).toHaveBeenCalledWith("/today?view=board");
  });

  it("stays open when the press lands on the popup itself", async () => {
    const { onNavigate } = renderModule("/today?view=board&task=t1");

    await new Promise((resolve) => setTimeout(resolve, 0));
    // A press inside the popup — selecting text, aiming at a control — must
    // not dismiss the panel the reader is working in.
    fireEvent.mouseDown(pane());

    expect(onNavigate).not.toHaveBeenCalled();
  });

  // The surfaces this panel opens — the schedule editor, Priority, the List
  // picker — are portalled to the layer root, which is OUTSIDE the popup in
  // the DOM. Pressing one of them is pressing inside the Detail as far as the
  // reader is concerned (§3.2).
  it("stays open when the press lands on a floating layer it opened", async () => {
    const { onNavigate } = renderModule("/today?view=board&task=t1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const layerRoot = document.getElementById("floating-layer-root")!;
    const surface = document.createElement("div");
    layerRoot.appendChild(surface);
    fireEvent.mouseDown(surface);

    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("the same Task opened from the list", () => {
  it("keeps the presentation it had (§7)", () => {
    renderModule("/today?task=t1");

    expect(pane().classList.contains("is-overlay-drawer")).toBe(true);
    expect(pane().classList.contains("is-anchored-popover")).toBe(false);
  });

  it("claims no dialog role", () => {
    renderModule("/today?task=t1");

    expect(document.querySelector(".tm-drawer-scrim")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The column never had a scrim either, so the × has always been its way out
  // for a pointer.
  it("keeps its close button", () => {
    renderModule("/today?task=t1");

    expect(pane().querySelector(".tm-drawer-close")).not.toBeNull();
  });
});
