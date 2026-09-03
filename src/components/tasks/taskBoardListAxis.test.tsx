// @vitest-environment jsdom
//
// The third Board, wired (TASK_VIEWS_EVERYWHERE_DESIGN.md §2, step 3).
//
// `boardAxis.test.ts` proves the rules; this proves the SCREEN asks them —
// that a Scope gathering several Lists draws those Lists as its columns, puts
// each card under its own, and hands a drop to `moveTaskToList`. The seam is
// worth its own test because it is four separate call sites in `TasksModule`
// (columns, columnOf, drop, create) that have to keep answering with the same
// axis, and three of them used to say `scope.kind === "inbox"` by hand.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

function list(id: string, name: string, order: number, extra: Partial<List> = {}): List {
  return {
    id,
    name,
    order,
    projectId: "",
    kind: "regular",
    isDefault: false,
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
    ...extra,
  } as unknown as List;
}

const lists = [list("list-home", "Home", 0), list("list-work", "Work", 1), list("list-idle", "Idle", 2)];

function renderBoard(
  tasks: Task[],
  extra: { url?: string; onMutate?: (id: string, patch: Partial<Task>) => void } = {},
) {
  const onMutate = extra.onMutate ?? vi.fn();
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
          url={extra.url ?? "/today?view=board"}
          onNavigate={() => {}}
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
          onMutate={onMutate}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onMutate };
}

function columnNames(): string[] {
  return [...document.querySelectorAll(".tm-column h3")].map((heading) => heading.textContent ?? "");
}

describe("a Board over a Scope that gathers several Lists", () => {
  it("draws the Lists it gathered, and only those", () => {
    // `Idle` holds nothing today. An empty column per List in the account
    // would bury the two that have work in them.
    renderBoard([task("t1", "Write it up", "list-work"), task("t2", "Buy milk", "list-home")]);

    expect(columnNames()).toEqual(["Home", "Work"]);
  });

  it("puts each card under its own List", () => {
    renderBoard([task("t1", "Write it up", "list-work"), task("t2", "Buy milk", "list-home")]);

    const [home, work] = [...document.querySelectorAll(".tm-column")] as HTMLElement[];
    expect(within(home).getByText("Buy milk")).toBeTruthy();
    expect(within(work).getByText("Write it up")).toBeTruthy();
  });

  it("moves the task to that List when a card is dropped on a column", () => {
    const onMutate = vi.fn();
    renderBoard([task("t1", "Write it up", "list-work"), task("t2", "Buy milk", "list-home")], { onMutate });

    const [home, work] = [...document.querySelectorAll(".tm-column")] as HTMLElement[];
    fireEvent.dragStart(within(work).getByText("Write it up").closest("li")!);
    fireEvent.drop(home);

    // The one patch the List axis can write, and the Section cleared with it
    // because a Section belongs to the List being left.
    expect(onMutate).toHaveBeenCalledWith("t1", expect.objectContaining({ listId: "list-home", sectionId: "" }));
  });

  it("writes nothing when the card lands back where it started", () => {
    const onMutate = vi.fn();
    renderBoard([task("t1", "Write it up", "list-work")], { onMutate });

    const [work] = [...document.querySelectorAll(".tm-column")] as HTMLElement[];
    fireEvent.dragStart(within(work).getByText("Write it up").closest("li")!);
    fireEvent.drop(work);

    // Today cannot be reordered by hand either (the registry says so), so a
    // drop on the column a card is already in has nothing left to say.
    expect(onMutate).not.toHaveBeenCalled();
  });

  it("keeps the Inbox's own columns where the Inbox is the Scope", () => {
    // The other half of the axis: widening the registry must not have given
    // every Scope the same Board.
    renderBoard([task("t1", "Write it up", "list-work")], { url: "/inbox?view=board" });

    expect(columnNames()).not.toContain("Work");
    expect(columnNames()).toContain("Someday");
  });
});
