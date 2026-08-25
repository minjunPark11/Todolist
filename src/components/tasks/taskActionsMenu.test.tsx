// @vitest-environment jsdom
//
// The Detail's ⋯ menu, from the registry through to the patch that lands
// (spec §15.2, §15.3, §15.63, §15.66).
//
// `domain/tasks/actions.test.ts` already pins WHICH actions a Task in a given
// state is offered. What is checkable only here is the wiring: that the menu
// draws the registry's answer rather than a list of its own, that a chosen row
// runs the matching mutation, and that the same registry is what the row's
// right-click menu shows.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { List, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TasksModule } from "./TasksModule";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write the release notes",
    description: "",
    status: "open",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "p1",
    categoryId: "",
    parentTaskId: "",
    listId: "l1",
    tags: [],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
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

function renderModule(
  overrides: Partial<Task> = {},
  extra: { focusBusy?: boolean; onStartFocus?: (taskId: string) => void } = {},
) {
  const onMutate = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TasksModule
          tasks={[task(overrides)]}
          lists={[workList]}
          folders={[]}
          sidebarFolders={[]}
          savedFilters={[]}
          listSections={[]}
          dailyPlans={[]}
          tags={[]}
          taskTags={[]}
          today={TODAY}
          url="/list/l1?task=t1"
          onNavigate={() => {}}
          onStartFocus={extra.onStartFocus ?? (() => {})}
          focusBusy={extra.focusBusy ?? false}
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
          }}
          lifecycle={{
            onArchiveList: () => {},
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

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More" }));
  return screen.getByRole("menu");
}

function rows(): string[] {
  return screen.getAllByRole("menuitem").map((item) => item.textContent ?? "");
}

afterEach(cleanup);

describe("the Detail's More menu (§15.2, §15.3)", () => {
  it("opens from ⋯ and shows what the registry allows an open Task", async () => {
    const user = userEvent.setup();
    renderModule();
    await openMore(user);

    expect(rows()).toEqual(["Pin", "Start focus", "Mark won't do", "Move to trash"]);
  });

  it("does not repeat the Complete the header already draws (§15.3)", async () => {
    const user = userEvent.setup();
    renderModule();
    await openMore(user);

    // §15.70's duplicated row. The checkbox is one control away in the same
    // header, so a Complete here would be the second one on screen.
    expect(rows()).not.toContain("Complete");
    expect(screen.getByRole("checkbox", { name: "Done" })).toBeTruthy();
  });

  it("pins the Task, and offers the way back once it is pinned", async () => {
    const user = userEvent.setup();
    const { onMutate } = renderModule();
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Pin" }));

    expect(onMutate).toHaveBeenCalledTimes(1);
    const [taskId, patch] = onMutate.mock.calls[0];
    expect(taskId).toBe("t1");
    // §15.7: one field. A Pin that also wrote a status or a List would be the
    // rule that section states, broken quietly.
    expect(Object.keys(patch)).toEqual(["pinnedAt"]);
    expect(patch.pinnedAt).toBeTruthy();
  });

  it("says so in the header while the Task is pinned", async () => {
    const user = userEvent.setup();
    renderModule({ pinnedAt: NOW });
    expect(screen.getByText("Pinned")).toBeTruthy();

    await openMore(user);
    expect(rows()).toContain("Unpin");
    expect(rows()).not.toContain("Pin");
  });

  it("offers a trashed Task the way back instead of a second trip to the Trash", async () => {
    const user = userEvent.setup();
    const { onMutate } = renderModule({ deletedAt: NOW });
    await openMore(user);

    // The old panel drew "Move to trash" here, where its only effect was to
    // rewrite the timestamp that had put the Task there (§15.66).
    expect(rows()).toEqual(["Restore"]);
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(onMutate.mock.calls[0][1]).toEqual({ deletedAt: "" });
  });

  it("hands Start Focus the Task id and nothing else (§25.6)", async () => {
    const user = userEvent.setup();
    const onStartFocus = vi.fn();
    const { onMutate } = renderModule({}, { onStartFocus });
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Start focus" }));

    expect(onStartFocus).toHaveBeenCalledWith("t1");
    // Starting a session is not an edit to the Task, so there is nothing to
    // undo and nothing to write.
    expect(onMutate).not.toHaveBeenCalled();
  });

  it("refuses Start Focus while another session runs, and says why (§15.5)", async () => {
    const user = userEvent.setup();
    const onStartFocus = vi.fn();
    renderModule({}, { focusBusy: true, onStartFocus });
    await openMore(user);

    const item = screen.getByRole("menuitem", { name: /Start focus/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain("A focus session is already running");
    await user.click(item);
    expect(onStartFocus).not.toHaveBeenCalled();
  });

  it("closes on Escape without closing the Detail under it (§15.48, §15.49)", async () => {
    const user = userEvent.setup();
    renderModule();
    await openMore(user);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    // §15.49's second Escape is the Drawer's, so the first must leave it open.
    expect(screen.getByRole("complementary", { name: "Task detail" })).toBeTruthy();
  });
});

describe("the row's menu (§15.63)", () => {
  it("shows the same actions as the Detail's, around its own choice sets", async () => {
    const user = userEvent.setup();
    renderModule();
    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Write the release notes") });

    const labels = rows();
    // Registry rows on both sides of the priority and date sets — §15.42's
    // order. Complete is here because a row has no checkbox to promote it to.
    expect(labels).toContain("Pin");
    expect(labels).toContain("Start focus");
    expect(labels).toContain("Complete");
    expect(labels).toContain("Mark won't do");
    expect(labels).toContain("Move to trash");
    expect(labels.indexOf("Pin")).toBeLessThan(labels.indexOf("High"));
    expect(labels.indexOf("High")).toBeLessThan(labels.indexOf("Move to trash"));
  });
});
