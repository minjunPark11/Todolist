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

const inboxList: List = {
  id: "l-inbox",
  projectId: "p1",
  kind: "inbox",
  name: "Inbox",
  order: 1,
  isDefault: false,
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
    onEmptyTrash?: () => { tasks: number; lists: number; tasksWithLists: number };
    scopeViewOptions?: Record<string, ScopeViewOptions>;
    onSetScopeViewOptions?: (next: Record<string, ScopeViewOptions>) => void;
    onDuplicate?: (taskId: string) => (() => void) | null;
    activityFor?: (taskId: string) => TaskActivityEntry[];
    onSaveAsTemplate?: (taskId: string) => string;
    onDeleteTemplate?: (templateId: string) => void;
    /** Q7 moved the List actions into the ⋯, so a test has to see them fire. */
    onTrashList?: (listId: string) => void;
    lists?: List[];
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
          lists={extra.lists ?? [workList]}
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
          onEmptyTrash={extra.onEmptyTrash ?? (() => ({ tasks: 0, lists: 0, tasksWithLists: 0 }))}
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
            onTrashList: extra.onTrashList ?? (() => {}),
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
    // The exact list, which this test would not pin while the menu still
    // added priority and date sets of its own — §8.5 counted them and left
    // them, and §15 took them away. They were the back door around §14's
    // freeze: the Detail beside this menu drew the same two as facts.
    // `Close` is the context menu's own last row, not the registry's.
    expect(rows()).toEqual(["Copy link", "Task activities", "Restore", "Delete forever", "Close"]);

    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(onMutate.mock.calls[0][1]).toEqual({ deletedAt: "" });
  });

  // §15 (Q5). The two sets were written out by hand in `taskMenuAt`, outside
  // the registry that already knew a trashed Task has four actions — the same
  // mistake, one layer up, as the `Move to trash` the comment there recalls.
  it("adds no priority or date set to a trashed Task's row menu", async () => {
    const user = userEvent.setup();
    renderModule({ deletedAt: NOW, dueDate: "2026-08-20" }, { url: "/trash?task=t1" });
    await openRowMore(user);

    const labels = rows();
    for (const gone of ["High", "Medium", "Low", "No priority", "Due today", "Due tomorrow", "Clear the date"]) {
      expect(labels).not.toContain(gone);
    }
  });

  // And the sets are still there for a Task that is not deleted: the gate is
  // the Trash's, not a removal.
  it("still adds them to a Task that is not in the Trash", async () => {
    const user = userEvent.setup();
    renderModule({ dueDate: "2026-08-20" });
    await openRowMore(user);

    const labels = rows();
    expect(labels).toContain("High");
    expect(labels).toContain("Due today");
    expect(labels).toContain("Clear the date");
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

  // §13.4 had put the selector back in the HEADER, as icons. It is in this
  // menu again (TASK_VIEWS_EVERYWHERE_DESIGN.md §3.1), as one row of icons
  // under a heading, and as a closed choice rather than three pressed buttons.
  it("holds the views as one closed choice, with the current one checked", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });

    expect(document.querySelector(".tm-header .tm-views")).toBeNull();

    await openScopeMenu(user);
    expect(screen.getByRole("menuitemradio", { name: "Board" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "List" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
  });

  it("switches the view when one is chosen", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderModule({}, { url: "/list/l1?view=board", onNavigate });

    await openScopeMenu(user);
    await user.click(screen.getByRole("menuitemradio", { name: "Timeline" }));

    // Asserted on the address rather than on the render: the view is a reading
    // of the URL (§15.9), and this harness hands the module a `onNavigate`
    // that goes nowhere — so what there is to check is what it was asked for.
    // The Scope stays and only the view moves.
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0][0]).toContain("/list/l1");
    expect(onNavigate.mock.calls[0][0]).toContain("view=gantt");
    // And the menu is gone: the view IS the screen, so leaving the surface
    // open over the new one would be a menu about something else.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // §16.26 Gate 3: a single-option selector is not a choice. The Scopes with
  // one view are the finished-work three (TASK_VIEWS_EVERYWHERE_DESIGN.md §2),
  // and they have no menu either — so this asserts both halves at once.
  it("offers nothing to choose where there is one view", () => {
    renderModule({}, { url: "/trash" });
    expect(document.querySelector(".tm-header .tm-views")).toBeNull();
    expect(screen.queryByRole("button", { name: "View and options" })).toBeNull();
  });

  it("offers all three on a Scope that gathers several Lists", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/today" });

    await openScopeMenu(user);
    expect(screen.getAllByRole("menuitemradio").map((node) => node.getAttribute("aria-label"))).toEqual([
      "List",
      "Board",
      "Timeline",
    ]);
  });

  // SCOPE_VIEW_OPTIONS_DESIGN.md §14: a two-state setting is ONE row that says
  // what pressing it will do, and flips when it is done.
  describe("a setting with two states", () => {
    it("names the change, not the state, and flips after it", async () => {
      const user = userEvent.setup();
      const options = { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showDetails: false } };
      renderModule({}, { url: "/list/l1", scopeViewOptions: options });

      await openScopeMenu(user);
      expect(rows()).toContain("Show details");
      expect(rows()).not.toContain("Hide details");
      cleanup();

      renderModule(
        {},
        {
          url: "/list/l1",
          scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showDetails: true } },
        },
      );
      await openScopeMenu(user);
      expect(rows()).toContain("Hide details");
      expect(rows()).not.toContain("Show details");
    });

    it("puts no tick in any label", async () => {
      // The `✓` used to be glued to the front of the label text, where a
      // screen reader meets a decorative character and no `aria-checked`.
      const user = userEvent.setup();
      renderModule(
        {},
        {
          url: "/list/l1?view=board",
          scopeViewOptions: {
            "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, hideCompleted: true, showDetails: true },
          },
        },
      );

      await openScopeMenu(user);
      for (const row of rows()) expect(row).not.toContain("✓");
    });

    it("leaves the settings with three answers alone", async () => {
      // The rule is for PAIRS. Group by and Sort by have no opposite to flip
      // to, and they stay "current value + submenu" (§14.3).
      const user = userEvent.setup();
      renderModule({}, { url: "/list/l1?view=board" });

      await openScopeMenu(user);
      // The view picker is the one closed choice in this menu, and it is drawn
      // as a set rather than as a flip.
      expect(screen.getAllByRole("menuitemradio").length).toBe(3);
    });
  });

  // Q4's two `Task Time` rows are gone with the Scope they were for: they
  // existed because a Scope with no Board would have opened a modal to show
  // one line, and there is no such Scope left (§2). `Task Time` has one door
  // again — the dialog — rather than two that could disagree.
  it("holds what the Scope shows, and sends the column settings to the dialog", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/today" });

    await openScopeMenu(user);
    // `Hide completed` is absent: it is a Board row and this Scope opened on
    // the list. The rows say what pressing them does now, with no `✓` in the
    // words (SCOPE_VIEW_OPTIONS_DESIGN.md §14.2).
    expect(rows()).toEqual(["Show details", "View Options"]);
  });

  it("opens the dialog on a Scope that gathers several Lists", async () => {
    const user = userEvent.setup();
    const onSetScopeViewOptions = vi.fn();
    renderModule({}, { url: "/today", onSetScopeViewOptions });

    await openScopeMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "View Options" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  // §13.5 (Q7). The words used to be in the header, 152px in front of the view
  // icons, for something a List is told once in its life. There were two of
  // them until §16.6 — `Archive list` was a second soft state whose only door
  // back was the same hidden dialog, so it was the weaker copy of its
  // neighbour.
  it("offers a List what to do with itself, at the bottom", async () => {
    const user = userEvent.setup();
    const onTrashList = vi.fn();
    renderModule({}, { url: "/list/l1", onTrashList });

    await openScopeMenu(user);
    // Last, under the separator: the rows above act on what the screen
    // SHOWS, and this one acts on the List.
    expect(rows().slice(-1)).toEqual(["Delete list"]);
    expect(rows()).not.toContain("Archive list");

    await user.click(screen.getByRole("menuitem", { name: "Delete list" }));
    // Straight through, no second question — the List is in the Trash, where
    // it can be brought back, and its Tasks are not touched (§13.5, §16.3).
    expect(onTrashList).toHaveBeenCalledWith("l1");
  });

  // The Inbox is the floor a Task falls back to (§6.5). Putting it away
  // would leave the account with nowhere to capture.
  it("offers the Inbox neither", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l-inbox", lists: [workList, inboxList] });

    await openScopeMenu(user);
    const labels = rows();
    expect(labels).not.toContain("Archive list");
    expect(labels).not.toContain("Delete list");
  });

  // Every other Scope: there is no List to archive on `/today`.
  it("offers them to nothing that is not a List", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/today" });

    await openScopeMenu(user);
    expect(rows()).not.toContain("Delete list");
  });

  // They left a gap where they stood. Nothing else was in it.
  it("leaves the header to the title, the count and the icons", () => {
    renderModule({}, { url: "/list/l1" });
    expect(document.querySelector(".tm-header .tm-scope-actions")).toBeNull();
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

  // §13.8: the card belongs to the GROUP, not to the row. Each chooser is
  // alone in one and the switches share a third — which is the reference's
  // arrangement and the shape a second switch drops into rather than
  // occasioning a rebuild.
  it("puts each chooser on its own card and the switches together", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });

    const dialog = await openDialog(user, "/list/l1?view=board");
    const groups = [...dialog.querySelectorAll(".tm-view-group")];
    expect(groups).toHaveLength(3);


    // The switch is not sharing with `Kanban Size`, which is the grouping
    // this replaced getting it wrong by accident rather than on purpose.
    // Two switch cards since §14.5 — `Task Time` was a two-option `<select>`
    // and a dropdown holding exactly two values is a switch drawn as a menu.
    // Neither shares with `Kanban Size`, which is the grouping this replaced
    // getting wrong by accident rather than on purpose.
    const withSwitch = groups.filter((g) => g.querySelector("[role=\"switch\"]"));
    expect(withSwitch).toHaveLength(2);
    for (const group of withSwitch) expect(group.querySelectorAll("select")).toHaveLength(0);

    // And every row still sits inside one — a row loose in the dialog would
    // have no card at all now that the row is not one.
    expect(dialog.querySelectorAll(".tm-view-option")).toHaveLength(
      dialog.querySelectorAll(".tm-view-group .tm-view-option").length,
    );
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
    // A switch, not a two-option dropdown (§14.5).
    await user.click(within(dialog).getByRole("switch", { name: "Show countdown" }));
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
  it("offers the column settings on a Scope that has a Board", async () => {
    const user = userEvent.setup();
    renderModule({}, { url: "/list/l1?view=board" });
    const dialog = await openDialog(user, "/list/l1?view=board");
    expect(within(dialog).getByRole("combobox", { name: "Kanban Size" })).toBeTruthy();
    expect(within(dialog).getByRole("switch", { name: "Show Input Box" })).toBeTruthy();

    // The board-less half of this claim is one test up: those Scopes have no
    // dialog at all since Q4, because the only row left in it would have been
    // `Show Date by`.
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

  // §13.6 (Q1). This test used to assert the opposite — that turning the
  // setting off left the column with NO way in — and the reference app's own
  // screen says otherwise: the header grows a `+` the moment the row goes.
  // The setting chooses WHERE the door is, not WHETHER there is one.
  it("moves the column's way in rather than taking it away", () => {
    renderModule({}, { url: "/list/l1?view=board" });
    expect(document.querySelector(".tm-column-add-row")).toBeTruthy();
    expect(document.querySelector(".tm-column-add-head")).toBeNull();

    cleanup();
    renderModule(
      {},
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showInputBox: false } },
      },
    );
    expect(document.querySelector(".tm-column-add-row")).toBeNull();
    expect(document.querySelector(".tm-column-add-head")).toBeTruthy();
    // Still one per column and no more: the two are never both drawn.
    const doors = screen.getAllByRole("button", { name: /^Add a task to/ });
    expect(doors.length).toBe(document.querySelectorAll(".tm-column").length);
  });

  // The half that was actually broken: the header `+` was drawn by nothing,
  // and the form it opens was gated on the same setting that hid the row —
  // so a `+` there would have been a button that did nothing.
  it("opens the same form from the header as from the row", async () => {
    const user = userEvent.setup();
    renderModule(
      {},
      {
        url: "/list/l1?view=board",
        scopeViewOptions: { "list:l1": { ...DEFAULT_SCOPE_VIEW_OPTIONS, showInputBox: false } },
      },
    );

    const door = screen.getAllByRole("button", { name: /^Add a task to/ })[0];
    const name = door.getAttribute("aria-label") ?? "";
    await user.click(door);

    expect(screen.getByRole("textbox", { name })).toBeTruthy();
    // Its own `+` steps aside while the form is open — one door at a time —
    // and the other columns keep theirs.
    expect(screen.queryByRole("button", { name })).toBeNull();
    expect(document.querySelectorAll(".tm-column-add-head").length).toBe(
      document.querySelectorAll(".tm-column").length - 1,
    );
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
    const onEmptyTrash = vi.fn(() => ({ tasks: 1, lists: 0, tasksWithLists: 0 }));
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
    const onEmptyTrash = vi.fn(() => ({ tasks: 0, lists: 0, tasksWithLists: 0 }));
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
