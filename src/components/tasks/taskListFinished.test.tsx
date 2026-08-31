// @vitest-environment jsdom
//
// The list view's "완료" group.
//
// The Board's columns have had one since their phase 2 and the list had
// nothing: §12.4 keeps finished work out of a Scope's rows, so ticking a row
// in the list simply removed it from the screen. The undo strip at the bottom
// of the window was the only evidence that anything had happened, and a row
// that vanishes leaves the reader unable to check it was the right one.
//
// What has to hold is what `taskBoardFinished.test.tsx` holds for a column,
// asked of the other view: the group is below the open rows, collapsed to a
// count, and the count on the Scope's head still means "what is left".
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { List, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TasksModule } from "./TasksModule";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;

afterEach(cleanup);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    status: "todo",
    priority: "none",
    listId: "l1",
    tags: [],
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    repeatType: "none",
    ...overrides,
  } as Task;
}

const workList: List = {
  id: "l1",
  projectId: "p1",
  kind: "regular",
  name: "Work",
  order: 0,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const finished = (title: string, at: string) =>
  task({ id: title, title, status: "done", completedAt: at });

function renderList(tasks: Task[]) {
  renderAt(tasks, "/list/l1");
}

/** The Completed Scope, whose rows are the finished work itself. */
function renderCompleted(tasks: Task[]) {
  renderAt(tasks, "/completed");
}

function renderAt(tasks: Task[], url: string) {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TasksModule
          tasks={tasks}
          lists={[workList]}
          folders={[]}
          sidebarFolders={[]}
          savedFilters={[]}
          listSections={[]}
          dailyPlans={[]}
          tags={[]}
          taskTags={[]}
          today={TODAY}
          url={url}
          onNavigate={() => {}}
          onCreate={() => {}}
          draftTitle=""
          onDraftConsumed={() => {}}
          onCreateList={() => "list-new"}
          onCreateSidebarFolder={() => "sf-new"}
          drawer={
            {
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
            } as never
          }
          lifecycle={{
            onArchiveList: () => {},
            onTrashList: () => {},
            onRestoreList: () => {},
            onPermanentlyDeleteList: () => {},
          }}
          onSaveAsTemplate={() => "tpl-1"}
          onDeleteTemplate={() => {}}
          templates={[]}
          onUseTemplate={() => {}}
          onMutate={() => {}}
          onStartFocus={() => {}}
          onDuplicate={() => null}
          focusBusy={false}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
}

/**
 * The Module under test, minus its sidebar.
 *
 * The sidebar carries a "Completed" Scope of its own, so an unscoped query for
 * that word finds two buttons and cannot say which one it meant. What is under
 * test is the group inside the view.
 */
function main() {
  return within(document.querySelector("main")!);
}

describe("the list view's finished work", () => {
  // Opposite to a Board column's, and deliberately so. A column is a narrow
  // strip of a working surface and finished work open there pushes what is
  // left below the fold; this group is the last thing on the page and pushes
  // nothing down. Shut, it would hide the row the reader just ticked — which
  // is the whole reason the group exists.
  it("starts open, showing the work that was finished", () => {
    renderList([task({ id: "open", title: "Still to do" }), finished("Done one", NOW)]);

    const head = main().getByRole("button", { name: /Completed/ });
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(main().getByText("Done one")).toBeTruthy();
    expect(head.textContent).toContain("1");
  });

  it("collapses to its count when the header is pressed", () => {
    renderList([task({ id: "open", title: "Still to do" }), finished("Done one", NOW)]);

    fireEvent.click(main().getByRole("button", { name: /Completed/ }));
    expect(main().queryByText("Done one")).toBeNull();
    expect(main().getByRole("button", { name: /Completed/ }).textContent).toContain("1");
  });

  it("is not drawn where the Scope has finished nothing", () => {
    renderList([task({ id: "open", title: "Still to do" })]);
    expect(main().queryByRole("button", { name: /Completed/ })).toBeNull();
  });

  it("sits below the open rows, never above them", () => {
    renderList([task({ id: "open", title: "Still to do" }), finished("Done one", NOW)]);
    const rows = main().getByLabelText("Work", { selector: "ul" });
    const done = document.querySelector(".tm-column-done")!;
    expect(rows.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws the group rather than the empty state when everything is done", () => {
    // The Scope has no open rows at all. "아직 할 일이 없습니다" over a list of
    // work finished this morning would be the screen contradicting itself.
    renderList([finished("Done one", NOW)]);
    expect(main().getByRole("button", { name: /Completed/ })).toBeTruthy();
  });

  it("shows the newest tick first", () => {
    renderList([
      finished("Older", `${TODAY}T08:00:00.000Z`),
      finished("Newer", `${TODAY}T10:00:00.000Z`),
    ]);
    const group = document.querySelector(".tm-column-done")!;
    const titles = within(group as HTMLElement)
      .getAllByText(/Older|Newer/)
      .map((node) => node.textContent);
    expect(titles).toEqual(["Newer", "Older"]);
  });
});

// The Scopes that ARE the finished work.
//
// `finished: true` relaxes a precondition Completed, Won't Do and Trash never
// had, so the second query answers with the rows the first one already
// returned. Drawing the group from that unfiltered would put every task on the
// Completed screen twice.
describe("a Scope whose rows are already finished", () => {
  it("draws no group of its own", () => {
    renderCompleted([finished("Done one", NOW), finished("Done two", NOW)]);
    expect(main().queryByRole("button", { name: /Completed/ })).toBeNull();
    expect(main().getAllByText(/Done one/)).toHaveLength(1);
  });
});
