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
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { List, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TasksModule } from "./TasksModule";
import type { TaskActivityEntry } from "../../domain/tasks/activity";
import { DEFAULT_SCOPE_VIEW_OPTIONS, type ScopeViewOptions } from "../../domain/view/scopeViewOptions";

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
  extra: {
    focusBusy?: boolean;
    onStartFocus?: (taskId: string) => void;
    onDeleteForever?: (taskId: string) => void;
    onNavigate?: (url: string, mode?: "push" | "replace") => void;
    onEmptyTrash?: () => number;
    scopeViewOptions?: Record<string, ScopeViewOptions>;
    onSetScopeViewOptions?: (next: Record<string, ScopeViewOptions>) => void;
    onDuplicate?: (taskId: string) => (() => void) | null;
    activityFor?: (taskId: string) => TaskActivityEntry[];
    onSaveAsTemplate?: (taskId: string) => string;
    onDeleteTemplate?: (templateId: string) => void;
    /**
     * The Scope to render in.
     *
     * A trashed Task has no ROW in a List Scope — `queryScopeTasks` keeps it
     * out — while the Detail still opens it, because `?task=` is looked up
     * against every Task. So a test about a trashed Task's row menu has to be
     * in `/trash`, where the row exists.
     */
    url?: string;
  } = {},
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
          url={extra.url ?? "/list/l1?task=t1"}
          onNavigate={extra.onNavigate ?? (() => {})}
          onStartFocus={extra.onStartFocus ?? (() => {})}
          onDeleteForever={extra.onDeleteForever ?? (() => {})}
          onEmptyTrash={extra.onEmptyTrash ?? (() => 0)}
          scopeViewOptions={extra.scopeViewOptions}
          onSetScopeViewOptions={extra.onSetScopeViewOptions ?? (() => {})}
          onDuplicate={extra.onDuplicate ?? (() => null)}
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
            activityFor: extra.activityFor ?? (() => []),
            remindersFor: () => [],
          }}
          lifecycle={{
            onArchiveList: () => {},
            onTrashList: () => {},
            onRestoreList: () => {},
            onPermanentlyDeleteList: () => {},
          }}
          onSaveAsTemplate={extra.onSaveAsTemplate ?? (() => "tpl-1")}
          onDeleteTemplate={extra.onDeleteTemplate ?? (() => {})}
          templates={[]}
          onUseTemplate={() => {}}
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

/**
 * The row's menu rather than the Detail's.
 *
 * Needed since §3.2 took the ⋯ out of a trashed Task's Detail: the Detail
 * answers two questions there and the full list stays on the row, so a test
 * about what a trashed Task is OFFERED has to ask the surface that still
 * offers it.
 */
async function openRowMore(user: ReturnType<typeof userEvent.setup>) {
  // Right-click, the way the row's own suite below opens it. The ⋯ on a row
  // appears on hover, which jsdom has no pointer to give it.
  await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Write the release notes") });
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

    expect(rows()).toEqual([
      // The `add` group leads, which is where the reference app puts
      // "Add subtask" (TICKTICK_DETAIL_ANATOMY_DESIGN.md §2). These four open a
      // section of the Detail rather than change the Task, and only the Detail
      // is offered them — a row's menu has nowhere to open one.
      "Add a subtask",
      "Tags",
      "Waiting on",
      "Notes",
      "Pin",
      "Duplicate",
      "Save as template",
      "Copy link",
      "Start focus",
      "Task activities",
      "Mark won't do",
      "Move to trash",
    ]);
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
    const { onMutate } = renderModule({ deletedAt: NOW }, { url: "/trash?task=t1" });
    await openRowMore(user);

    // The old panel drew "Move to trash" here, where its only effect was to
    // rewrite the timestamp that had put the Task there (§15.66). The way out
    // the other side sits below it (TRASH_PERMANENT_DELETE_DESIGN.md §3.1).
    //
    // What the REGISTRY contributes, rather than the whole list: this row menu
    // draws priority and date sets of its own, which it still offers a trashed
    // Task (§8.5 counts that and does not fix it). Pinning the exact list here
    // would nail that down as intended.
    const labels = rows();
    expect(labels).toContain("Restore");
    expect(labels).toContain("Delete forever");
    expect(labels).toContain("Copy link");
    expect(labels).not.toContain("Move to trash");
    expect(labels).not.toContain("Pin");
    expect(labels).not.toContain("Complete");

    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(onMutate.mock.calls[0][1]).toEqual({ deletedAt: "" });
  });

  // §3.2: a thrown-away Task's Detail answers two questions and drops the rest.
  // The List picker is the one that would otherwise let a reader edit what they
  // have already thrown away, before deciding whether to keep it at all.
  it("gives a trashed Task's Detail a footer of Restore and Delete forever", async () => {
    renderModule({ deletedAt: NOW });

    const footer = document.querySelector(".tm-drawer-foot")!;
    expect(footer).toBeTruthy();
    expect(within(footer as HTMLElement).getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(
      within(footer as HTMLElement).getByRole("button", { name: "Delete forever" }),
    ).toBeTruthy();
    // The two the footer used to hold are gone with it.
    expect(footer.querySelector(".tm-list-trigger")).toBeNull();
    expect(within(footer as HTMLElement).queryByRole("button", { name: "More" })).toBeNull();
  });

  it("leaves a live Task's Detail footer alone", async () => {
    renderModule();

    const footer = document.querySelector(".tm-drawer-foot")!;
    expect(footer.querySelector(".tm-list-trigger")).toBeTruthy();
    expect(within(footer as HTMLElement).queryByRole("button", { name: "Restore" })).toBeNull();
  });

  // §3.3: the app's one action with no way back does not happen on the click
  // that chose it. The menu row asks; the dialog is what deletes.
  it("asks before deleting a trashed Task forever, and deletes nothing until it is answered", async () => {
    const user = userEvent.setup();
    const onDeleteForever = vi.fn();
    const { onMutate } = renderModule({ deletedAt: NOW }, { onDeleteForever, url: "/trash?task=t1" });
    await openRowMore(user);

    await user.click(screen.getByRole("menuitem", { name: "Delete forever" }));
    expect(onDeleteForever).not.toHaveBeenCalled();
    // Nothing was patched on the way past, either — the row is not a mutation.
    expect(onMutate).not.toHaveBeenCalled();

    // Scoped to the dialog: the Detail's own footer carries a button by the
    // same name, and the one that deletes is the one inside the question.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete this task forever?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Delete forever" }));
    expect(onDeleteForever).toHaveBeenCalledWith("t1");
  });

  it("deletes nothing when the question is answered no", async () => {
    const user = userEvent.setup();
    const onDeleteForever = vi.fn();
    renderModule({ deletedAt: NOW }, { onDeleteForever, url: "/trash?task=t1" });
    await openRowMore(user);

    await user.click(screen.getByRole("menuitem", { name: "Delete forever" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Only that nothing was deleted. Whether the dialog has finished leaving
    // is `ConfirmModal`'s exit animation, which jsdom does not run — asserting
    // on it here would be testing framer-motion under a name about deletion.
    expect(onDeleteForever).not.toHaveBeenCalled();
  });

  it("saves a template without changing the Task, and offers to take it back (§25.8)", async () => {
    const user = userEvent.setup();
    const onSaveAsTemplate = vi.fn(() => "tpl-9");
    const onDeleteTemplate = vi.fn();
    const { onMutate } = renderModule({}, { onSaveAsTemplate, onDeleteTemplate });
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Save as template" }));

    expect(onSaveAsTemplate).toHaveBeenCalledWith("t1");
    // §25.8: "current Task 자체는 유지" — nothing about the Task changes, which
    // is also why the way back deletes the template rather than patching.
    expect(onMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onDeleteTemplate).toHaveBeenCalledWith("tpl-9");
  });

  it("duplicates, and offers the way to take the copy back (§15.55)", async () => {
    const user = userEvent.setup();
    const discard = vi.fn();
    const onDuplicate = vi.fn(() => discard);
    renderModule({}, { onDuplicate });
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(onDuplicate).toHaveBeenCalledWith("t1");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("offers no Undo when there was nothing to copy (§15.67)", async () => {
    const user = userEvent.setup();
    renderModule({}, { onDuplicate: () => null });
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    // A toast offering to undo something that did not happen is worse than no
    // toast: pressing it would look like it had failed.
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("copies the Task's link and says so, with nothing to undo (§15.21, §15.58)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const { onMutate } = renderModule();
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Copy link" }));

    await screen.findByText("Link copied.");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/list/l1?task=t1"));
    // §15.58: Copy Link is not a mutation, so there is no patch and no Undo.
    expect(onMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("shows the URL to copy by hand when the clipboard refuses (§15.22)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    // The `execCommand` fallback is not implemented in jsdom either, so this
    // exercises both refusals at once — which is the case §15.22 is about.
    renderModule();
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Copy link" }));

    await screen.findByText("Couldn't copy the link.");
    const field = document.querySelector(".tm-undo-value") as HTMLInputElement;
    expect(field.value).toContain("/list/l1?task=t1");
    vi.unstubAllGlobals();
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

  it("opens the history in the Detail, and closes it again (§25.7)", async () => {
    const user = userEvent.setup();
    renderModule({}, {
      activityFor: () => [
        { id: "t1:created", kind: "created", at: "2026-08-18T09:00:00.000Z" },
        { id: "f1:focus", kind: "focus", at: "2026-08-18T10:00:00.000Z", detail: "25" },
      ],
    });
    await openMore(user);
    await user.click(screen.getByRole("menuitem", { name: "Task activities" }));

    const panel = screen.getByRole("region", { name: "Task activities" });
    expect(panel.textContent).toContain("Focused for 25 min");
    expect(panel.textContent).toContain("Created");
    // Focus goes to the heading: the row that opened this is gone, so the
    // menu's own restoration puts focus on the ⋯, which is above the panel and
    // says nothing about it.
    expect(document.activeElement?.textContent).toBe("Task activities");

    await user.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Task activities" })).toBeNull();
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

// SCOPE_VIEW_OPTIONS_DESIGN.md §3.2: the view selector moved out of the header
// and into the Scope's own menu.
describe("the Scope's menu", () => {
  const openScopeMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "View and options" }));
    return screen.getByRole("menu");
  };

  it("holds the views, with the current one marked", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });

    // Gone from the header — that is the half of this change that is a
    // removal, and a selector left in both places is the duplication this
    // repo keeps deleting.
    expect(document.querySelector(".tm-header .tm-views")).toBeNull();

    await openScopeMenu(user);
    expect(rows()).toEqual([
      "List",
      "✓ Board",
      "Timeline",
      // Only on the Board — the list view already leaves finished work out.
      "Hide Completed",
      "Show Details",
      "View Options",
    ]);
  });

  it("switches the view when one is chosen", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderModule({}, { url: "/list/l1?view=board", onNavigate });

    await openScopeMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Timeline" }));

    // Asserted on the address rather than on the render: the view is a reading
    // of the URL (§15.9), and this harness hands the module a `onNavigate`
    // that goes nowhere — so what there is to check is what it was asked for.
    // The Scope stays and only the view moves.
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0][0]).toContain("/list/l1");
    expect(onNavigate.mock.calls[0][0]).toContain("view=gantt");
  });

  // §16.26 Gate 3, one level up from where it used to live: six of the eight
  // Scopes have one view, and a single-row radio is not a choice. The MENU
  // still opens — §3.1 gives it to every Scope that is not finished work, and
  // since phase 3 it carries `View Options` — but the view section is absent.
  it("offers no views where there is nothing to choose", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/today" });

    await openScopeMenu(user);
    // `Hide Completed` is absent too: this Scope has no Board to hide any in.
    expect(rows()).toEqual(["Show Details", "View Options"]);
  });

  // §3.1: three lists of work that is over. "완료 숨기기" on the Completed
  // Scope is a button that empties the screen.
  it("does not appear on the Scopes that are finished work", () => {
    renderModule({ deletedAt: NOW }, { url: "/trash" });
    expect(screen.queryByRole("button", { name: "View and options" })).toBeNull();
  });
});

// SCOPE_VIEW_OPTIONS_DESIGN.md §1.2 / §3.4: the dialog, and the one setting it
// carries so far.
describe("View Options", () => {
  const openDialog = async (user: ReturnType<typeof userEvent.setup>, url: string) => {
    await user.click(screen.getByRole("button", { name: "View and options" }));
    await user.click(screen.getByRole("menuitem", { name: "View Options" }));
    return screen.getByRole("dialog");
  };

  it("opens from the Scope's menu and shows the setting", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });

    const dialog = await openDialog(user, "/list/l1?view=board");
    expect(within(dialog).getByRole("switch", { name: "Show Input Box" })).toBeTruthy();
  });

  // The value is per Scope (§3.3), so what the dialog writes is a record under
  // this Scope's key and nothing else in the map is disturbed.
  it("writes under this Scope's key, leaving the others alone", async () => {
    const user = userEvent.setup();
    const onSetScopeViewOptions = vi.fn();
    renderModule(
      {},
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { today: { ...DEFAULT_SCOPE_VIEW_OPTIONS, showDetails: true } },
        onSetScopeViewOptions,
      },
    );

    const dialog = await openDialog(user, "/list/l1?view=board");
    await user.click(within(dialog).getByRole("switch", { name: "Show Input Box" }));

    const written = onSetScopeViewOptions.mock.calls[0][0];
    expect(written["list:l1"].showInputBox).toBe(false);
    // The other Scope's record is carried through untouched — a settings map
    // written back without its neighbours is how one screen erases another's.
    expect(written.today.showDetails).toBe(true);
  });

  // §3.5, the write half. The read half is below, and they are separate
  // because this harness's `onSetScopeViewOptions` goes nowhere — the value
  // lives above the module, so what the dialog can be seen to do is ASK.
  it("asks for the other reading of the date", async () => {
    const user = userEvent.setup();
    const onSetScopeViewOptions = vi.fn();
    renderModule({}, { url: "/list/l1?view=board", onSetScopeViewOptions });

    const dialog = await openDialog(user, "/list/l1?view=board");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Show Date by" }),
      "countdown",
    );
    expect(onSetScopeViewOptions.mock.calls[0][0]["list:l1"].dateBy).toBe("countdown");
  });

  // The read half: the same date, said the other way. A row that drew both
  // would be answering one question twice.
  it("draws the date as what is left of it when that is the setting", () => {
    renderModule({ dueDate: "2026-08-25" }, { url: "/list/l1?view=board" });
    expect(document.querySelector(".tm-task-due")?.textContent).toBe("Aug 25");

    cleanup();
    renderModule(
      { dueDate: "2026-08-25" },
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, dateBy: "countdown" } },
      },
    );
    // TODAY is 2026-08-18 in this file, so a deadline a week later reads as
    // what is left rather than as the day it falls on.
    expect(document.querySelector(".tm-task-due")?.textContent).toBe("7d left");
  });

  // §3.6 and §15.5: the two rows that act on columns are drawn only where
  // there are columns. A switch that flips and changes nothing is worse than
  // one that is not there.
  it("offers the column settings on a Scope that has a Board, and not on one that does not", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });
    let dialog = await openDialog(user, "/list/l1?view=board");
    expect(within(dialog).getByRole("combobox", { name: "Kanban Size" })).toBeTruthy();
    expect(within(dialog).getByRole("switch", { name: "Show Input Box" })).toBeTruthy();

    cleanup();
    renderModule({}, { url: "/today" });
    dialog = await openDialog(user, "/today");
    expect(within(dialog).queryByRole("combobox", { name: "Kanban Size" })).toBeNull();
    expect(within(dialog).queryByRole("switch", { name: "Show Input Box" })).toBeNull();
    // The one that means something everywhere stays.
    expect(within(dialog).getByRole("combobox", { name: "Show Date by" })).toBeTruthy();
  });

  // The size is the column's width, so it is set once on the board and read by
  // every column — a board cannot end up with columns of two minds.
  it("sizes the columns from the Scope's setting", () => {
    renderModule({}, { url: "/list/l1?view=board" });
    expect(document.querySelector(".tm-board")?.className).toContain("is-medium");

    cleanup();
    renderModule(
      {},
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, kanbanSize: "large" } },
      },
    );
    expect(document.querySelector(".tm-board")?.className).toContain("is-large");
  });

  // §3.4: two entry points to one column is what the toggle exists to settle.
  it("takes the column's way in away when it is off", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });
    expect(screen.getAllByRole("button", { name: /^Add a task to/ }).length).toBeGreaterThan(0);

    cleanup();
    renderModule(
      {},
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showInputBox: false } },
      },
    );
    expect(screen.queryByRole("button", { name: /^Add a task to/ })).toBeNull();
    // And nothing took its place in the header — the `+` that used to be the
    // other answer is gone for good.
    expect(document.querySelector(".tm-column-add")).toBeNull();
  });
});

// §3.7 and §3.8: the two the menu carries rather than the dialog — they act on
// the Scope rather than settling how it is drawn.
describe("Hide Completed and Show Details", () => {
  it("takes the Board's finished groups away when asked", () => {
    renderModule({ status: "completed", completedAt: NOW }, { url: "/list/l1?view=board" });
    expect(document.querySelector(".tm-column-done")).toBeTruthy();

    cleanup();
    renderModule(
      { status: "completed", completedAt: NOW },
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, hideCompleted: true } },
      },
    );
    expect(document.querySelector(".tm-column-done")).toBeNull();
  });

  // §3.8: the mark and the line are the same fact, so only one is drawn.
  it("swaps the mark for a line of the body", () => {
    renderModule({ description: "the first line" }, { url: "/list/l1?view=board" });
    expect(document.querySelector(".tm-task-body")).toBeNull();
    expect(document.querySelector(".tm-task-tip")).toBeTruthy();

    cleanup();
    renderModule(
      { description: "the first line" },
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showDetails: true } },
      },
    );
    expect(document.querySelector(".tm-task-body")?.textContent).toBe("the first line");
    expect(document.querySelector(".tm-task-tip")).toBeNull();
  });

  // Q3: a card with no body draws nothing extra. An empty line kept for even
  // card heights would be a row of blank saying this task has nothing to say.
  it("draws nothing for a card with no body", () => {
    renderModule(
      { description: "", notes: "" },
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showDetails: true } },
      },
    );
    expect(document.querySelector(".tm-task-body")).toBeNull();
  });

  it("reads one line of a body that has several", () => {
    renderModule(
      { description: "first" + String.fromCharCode(10) + "second" },
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showDetails: true } },
      },
    );
    expect(document.querySelector(".tm-task-body")?.textContent).toBe("first");
  });
});

// §3.3: the Trash's own header action, and the sentence that says the number.
describe("emptying the Trash", () => {
  it("is offered on the Trash's header and nowhere else", () => {
    renderModule({ deletedAt: NOW }, { url: "/trash?task=t1" });
    expect(screen.getByRole("button", { name: "Empty trash" })).toBeTruthy();

    cleanup();
    renderModule();
    expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull();
  });

  // A button whose whole job is to remove things has nothing to say when
  // there is nothing to remove.
  it("is absent while the Trash is empty", () => {
    renderModule({}, { url: "/trash" });
    expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull();
  });

  it("asks with the number, and empties nothing until it is answered", async () => {
    const user = userEvent.setup();
    const onEmptyTrash = vi.fn(() => 1);
    renderModule({ deletedAt: NOW }, { url: "/trash?task=t1", onEmptyTrash });

    await user.click(screen.getByRole("button", { name: "Empty trash" }));
    expect(onEmptyTrash).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    // The count is the fact "empty" hides — a reader who does not know whether
    // it holds three or thirty is agreeing to something they cannot picture.
    expect(dialog.textContent).toContain("1 tasks");
    await user.click(within(dialog).getByRole("button", { name: "Empty trash" }));
    expect(onEmptyTrash).toHaveBeenCalledTimes(1);
  });

  it("empties nothing when the question is answered no", async () => {
    const user = userEvent.setup();
    const onEmptyTrash = vi.fn(() => 0);
    renderModule({ deletedAt: NOW }, { url: "/trash?task=t1", onEmptyTrash });

    await user.click(screen.getByRole("button", { name: "Empty trash" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onEmptyTrash).not.toHaveBeenCalled();
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
    expect(labels).toContain("Save as template");
    expect(labels.indexOf("Pin")).toBeLessThan(labels.indexOf("High"));
    expect(labels.indexOf("High")).toBeLessThan(labels.indexOf("Move to trash"));
  });
});
