// @vitest-environment jsdom
//
// The grouping, as the screen actually assembles it. `matrixGroups.test.ts`
// proves the rule; this proves the box draws what the rule says — including
// the two things the rule cannot know about: the cap on finished work, and
// what happens to a card the moment it is ticked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { List, Task, TaskStatus } from "../types";
import { I18nProvider } from "../i18n";
import { FloatingLayerProvider } from "./floating";
import { MatrixPage } from "./MatrixPage";
import type { MatrixQuadrantRules } from "../domain/view/matrixRules";

const TODAY = "2026-08-28";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random().toString(16).slice(2)}`,
    title: "A task",
    status: "todo" as TaskStatus,
    priority: "high",
    dueDate: "",
    projectId: "",
    tags: [],
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "",
    ...overrides,
  } as Task;
}

const lists: List[] = [];

function renderMatrix(tasks: Task[], handlers: Partial<Parameters<typeof MatrixPage>[0]> = {}) {
  return render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <MatrixPage
          tasks={tasks}
          lists={lists}
          selectedTaskId=""
          onOpenTask={() => {}}
          onUpdateTask={() => {}}
          onCreateTask={() => ""}
          onToggleDone={() => {}}
          {...handlers}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
}

/** The Ⅰ box, which every task in these fixtures is high enough to land in. */
function boxOne(): HTMLElement {
  return document.querySelector(".ff-matrix-cell-I") as HTMLElement;
}

function groupNames(box: HTMLElement): string[] {
  return [...box.querySelectorAll(".ff-matrix-group-name")].map((node) => node.textContent ?? "");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("what a box is divided into", () => {
  it("groups by date, late first and undated last", () => {
    renderMatrix([
      task({ id: "later", dueDate: "2026-09-30" }),
      task({ id: "undated" }),
      task({ id: "late", dueDate: "2026-08-20" }),
      task({ id: "now", dueDate: TODAY }),
      task({ id: "soon", dueDate: "2026-08-29" }),
    ]);

    expect(groupNames(boxOne())).toEqual(["Overdue", "Today", "Tomorrow", "Later", "No date"]);
  });

  it("counts each group, and draws none that is empty", () => {
    renderMatrix([task({ dueDate: "2026-08-20" }), task({ dueDate: "2026-08-20" })]);

    const box = boxOne();
    expect(groupNames(box)).toEqual(["Overdue"]);
    expect(box.querySelector(".ff-matrix-group-count")?.textContent).toBe("2");
  });

  it("puts no count on the box itself", () => {
    // The group counts are the numbers that answer something. One number over
    // a box is a number the reader has to divide up by eye.
    renderMatrix([task({ dueDate: TODAY })]);
    expect(boxOne().querySelector(".ff-board-count")).toBeNull();
  });

  it("collapses a group and leaves its count on screen", async () => {
    renderMatrix([task({ title: "Write it up", dueDate: TODAY })]);

    const head = boxOne().querySelector(".ff-matrix-group-head") as HTMLElement;
    expect(head.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(head);

    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(within(boxOne()).queryByText("Write it up")).toBeNull();
    expect(boxOne().querySelector(".ff-matrix-group-count")?.textContent).toBe("1");
  });
});

describe("finished work", () => {
  const done = (id: string, completedAt: string) =>
    task({ id, title: id, status: "completed" as TaskStatus, completedAt, dueDate: "2026-08-01" });

  it("stays in the box its priority names, under its own group", () => {
    // D2. It used to be filtered off the screen entirely.
    renderMatrix([done("finished", "2026-08-27T09:00:00.000Z"), task({ id: "open", dueDate: TODAY })]);

    expect(groupNames(boxOne())).toEqual(["Today", "Completed"]);
    expect(within(boxOne()).getByText("finished")).toBeTruthy();
  });

  it("shows five, then offers the rest", () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      done(`done-${index}`, `2026-08-2${index}T09:00:00.000Z`),
    );
    renderMatrix(tasks);

    const box = boxOne();
    expect(box.querySelectorAll(".ff-matrix-card")).toHaveLength(5);
    expect(box.querySelector(".ff-matrix-group-count")?.textContent).toBe("8");
    expect(box.querySelector(".ff-matrix-group-more")).toBeTruthy();
  });

  it("shows the rest when asked, and stops offering", async () => {
    const tasks = Array.from({ length: 8 }, (_, index) =>
      done(`done-${index}`, `2026-08-2${index}T09:00:00.000Z`),
    );
    renderMatrix(tasks);

    await userEvent.click(boxOne().querySelector(".ff-matrix-group-more") as HTMLElement);

    expect(boxOne().querySelectorAll(".ff-matrix-card")).toHaveLength(8);
    expect(boxOne().querySelector(".ff-matrix-group-more")).toBeNull();
  });

  it("puts what was finished most recently first", () => {
    // With a cap of five, an old-first order would hide the task the reader
    // just ticked — which is the one they are looking for.
    renderMatrix([
      done("oldest", "2026-08-01T09:00:00.000Z"),
      done("newest", "2026-08-28T08:00:00.000Z"),
      done("middle", "2026-08-14T09:00:00.000Z"),
    ]);

    const titles = [...boxOne().querySelectorAll(".tm-task-title")].map((node) => node.textContent);
    expect(titles).toEqual(["newest", "middle", "oldest"]);
  });
});

describe("ticking a card", () => {
  it("asks to toggle rather than deciding anything itself", async () => {
    const onToggleDone = vi.fn();
    renderMatrix([task({ id: "t1", title: "Write it up", dueDate: TODAY })], { onToggleDone });

    await userEvent.click(boxOne().querySelector(".tm-task-check input") as HTMLInputElement);
    expect(onToggleDone).toHaveBeenCalledWith("t1");
  });

  it("moves the card into the same box's completed group once the record says so", () => {
    // The screen is a function of the records: the check hands the change up,
    // and the task comes back finished. What matters is where it lands — the
    // box it was already in, not somewhere the reader has to go looking.
    const { rerender } = renderMatrix([task({ id: "t1", title: "Write it up", dueDate: TODAY })]);
    expect(groupNames(boxOne())).toEqual(["Today"]);

    rerender(
      <I18nProvider lang="en">
        <MatrixPage
          tasks={[
            task({
              id: "t1",
              title: "Write it up",
              dueDate: TODAY,
              status: "completed" as TaskStatus,
              completedAt: `${TODAY}T09:00:00.000Z`,
            }),
          ]}
          lists={lists}
          selectedTaskId=""
          onOpenTask={() => {}}
          onUpdateTask={() => {}}
          onCreateTask={() => ""}
          onToggleDone={() => {}}
        />
      </I18nProvider>,
    );

    expect(groupNames(boxOne())).toEqual(["Completed"]);
    expect(within(boxOne()).getByText("Write it up")).toBeTruthy();
  });
});

describe("the box's ⋯ menu", () => {
  function openMenu() {
    return userEvent.click(boxOne().querySelector(".ff-matrix-cell-menu") as HTMLElement);
  }

  it("says how the box is grouped and ordered without being opened twice", async () => {
    renderMatrix([task({ dueDate: TODAY })]);
    await openMenu();

    expect(screen.getByRole("menuitem", { name: /Group by/ }).textContent).toContain("Date");
    expect(screen.getByRole("menuitem", { name: /Sort by/ }).textContent).toContain("Due date");
    expect(screen.getByRole("menuitem", { name: /Sort order/ }).textContent).toContain("Ascending");
  });

  it("offers no priority sort", () => {
    // Every task in a box has the box's priority, so it would sort nothing.
    renderMatrix([task({ dueDate: TODAY })]);
    return openMenu().then(() => {
      return userEvent.click(screen.getByRole("menuitem", { name: /Sort by/ })).then(() => {
        expect(screen.queryByRole("menuitem", { name: "Priority" })).toBeNull();
        expect(screen.getByRole("menuitem", { name: "Title" })).toBeTruthy();
      });
    });
  });

  it("hands the chosen setting up, for the box it was opened on", async () => {
    const onChangeQuadrantView = vi.fn();
    renderMatrix([task({ dueDate: TODAY })], { onChangeQuadrantView });

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Sort order/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Descending" }));

    expect(onChangeQuadrantView).toHaveBeenCalledWith("I", {
      groupBy: "dueDate",
      sortKey: "dueDate",
      sortOrder: "desc",
    });
  });

  it("draws the box the way the stored view says", () => {
    renderMatrix(
      [
        task({ id: "b", title: "b", dueDate: "2026-08-20" }),
        task({ id: "a", title: "a", dueDate: "2026-08-21" }),
      ],
      { quadrantViews: { I: { groupBy: "none", sortKey: "title", sortOrder: "asc" } } },
    );

    // Grouping off: one group of open work with no header at all, and the
    // order is by title rather than by the deadline the default would use.
    const box = boxOne();
    expect(groupNames(box)).toEqual([]);
    expect([...box.querySelectorAll(".tm-task-title")].map((node) => node.textContent)).toEqual(["a", "b"]);
  });

  it("leaves the other boxes alone", async () => {
    const onChangeQuadrantView = vi.fn();
    renderMatrix([task({ priority: "low", dueDate: TODAY })], { onChangeQuadrantView });

    const boxThree = document.querySelector(".ff-matrix-cell-III") as HTMLElement;
    await userEvent.click(boxThree.querySelector(".ff-matrix-cell-menu") as HTMLElement);
    await userEvent.click(screen.getByRole("menuitem", { name: /Group by/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "None" }));

    expect(onChangeQuadrantView).toHaveBeenCalledWith("III", expect.objectContaining({ groupBy: "none" }));
  });
});

describe("the box's +", () => {
  const addTo = (box: string) => screen.getByRole("button", { name: `Add a task to ${box}` });
  const field = () => within(boxOne()).getByRole("textbox", { name: "What belongs in this box?" });

  it("is the only way in — the line under the cards is gone", () => {
    // Two doors into one room is two things to explain and one of them
    // redundant. The header's is the one next to the box's other control.
    renderMatrix([]);
    expect(document.querySelector(".ff-matrix-add")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Add a task to / })).toHaveLength(4);
  });

  it("opens an input at the top of the box it was pressed in, and nowhere else", async () => {
    renderMatrix([task({ title: "Already here", dueDate: TODAY })]);
    await userEvent.click(addTo("Do first"));

    expect(document.querySelectorAll(".ff-matrix-quick-add")).toHaveLength(1);
    expect(boxOne().querySelector(".ff-matrix-cell-body")?.firstElementChild?.className).toContain(
      "ff-matrix-quick-add",
    );
    // Opened by a click, so the caret has to arrive without a second one.
    expect(document.activeElement).toBe(field());
  });

  it("gives what is typed the box's priority, and nothing else it did not ask for", async () => {
    const onCreateTask = vi.fn(() => "made");
    renderMatrix([], { onCreateTask });

    await userEvent.click(addTo("Schedule"));
    await userEvent.type(screen.getByRole("textbox", { name: "What belongs in this box?" }), "  Plan it  ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    // Ⅱ is `medium` (D1). No dueDate: the box is a priority now, so typing
    // into one cannot invent a deadline the way the two-axis rule had to.
    expect(onCreateTask).toHaveBeenCalledWith({ title: "Plan it", status: "open", priority: "medium" });
  });

  it("stays open and empty for the next one", async () => {
    const onCreateTask = vi.fn(() => "made");
    renderMatrix([], { onCreateTask });

    await userEvent.click(addTo("Do first"));
    await userEvent.type(field(), "First{Enter}");
    expect(onCreateTask).toHaveBeenCalledTimes(1);

    expect((field() as HTMLInputElement).value).toBe("");
    await userEvent.type(field(), "Second{Enter}");
    expect(onCreateTask).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape, and makes nothing on the way out", async () => {
    const onCreateTask = vi.fn(() => "made");
    renderMatrix([], { onCreateTask });

    await userEvent.click(addTo("Do first"));
    await userEvent.type(field(), "Never mind");
    await userEvent.keyboard("{Escape}");

    expect(document.querySelector(".ff-matrix-quick-add")).toBeNull();
    expect(onCreateTask).not.toHaveBeenCalled();
  });
});

describe("what a card says", () => {
  const lists = [{ id: "school", name: "School" } as List];
  const card = () => boxOne().querySelector(".ff-matrix-card") as HTMLElement;

  it("names the List without repeating it as a colour", () => {
    renderMatrix([task({ title: "Read ch. 4", listId: "school" })], { lists });

    expect(within(card()).getByText("School")).toBeTruthy();
    expect(card().querySelector(".ff-projbadge")).toBeNull();
    expect(card().querySelector(".ff-dot")).toBeNull();
  });

  it("writes the date as a date, not as a word for where it falls", () => {
    renderMatrix([task({ dueDate: "2026-09-20" })]);

    // "09.20" is a date only once the reader has worked out which half is the
    // month; the group header above it already said "Later".
    expect(card().querySelector(".tm-task-due")?.textContent).toBe("Sep 20");
    expect(card().querySelector(".is-overdue")).toBeNull();
  });

  it("marks a deadline that has already passed", () => {
    renderMatrix([task({ dueDate: "2026-08-20" })]);

    expect(card().querySelector(".tm-task-due")?.className).toContain("is-overdue");
  });

  it("stops calling it late once it is done", () => {
    // Red says "go and do this". The card has been ticked, so it is an alarm
    // about a job that is over — while the date itself is still worth reading.
    renderMatrix([
      task({
        title: "Filed late",
        dueDate: "2026-08-20",
        status: "completed" as TaskStatus,
        completedAt: "2026-08-27T10:00:00.000Z",
      }),
    ]);

    const due = card().querySelector(".tm-task-due");
    expect(due?.textContent).toBe("Aug 20");
    expect(due?.className).not.toContain("is-overdue");
  });

  it("flags work that repeats and work with more behind its title", () => {
    renderMatrix([
      task({ id: "rep", title: "Standup", repeatType: "weekly" }),
      task({ id: "note", title: "Draft", notes: "the outline" }),
      task({ id: "desc", title: "Spec", description: "why" }),
      task({ id: "bare", title: "Bare", notes: "   " }),
    ]);

    expect(screen.getAllByRole("img", { name: "Repeats" })).toHaveLength(1);
    // Both bodies count: a card only reports that there IS more, not which
    // field it is in.
    expect(screen.getAllByRole("img", { name: "Has notes" })).toHaveLength(2);
  });

  it("says nothing about the priority the box already names", () => {
    // D1: every card in Ⅰ is high. A flag on each of them would be the header
    // repeated once per row.
    renderMatrix([task({ title: "Urgent", priority: "high" })]);

    expect(card().querySelector(".tm-task-priority")).toBeNull();
    expect(within(card()).queryByText("High")).toBeNull();
  });

  it("shows the tick on a card that is done, and offers to undo it", () => {
    // The row was struck through and dimmed while the control that did it
    // still drew an empty circle — the one thing on the card that could be
    // acted on said the opposite of everything around it.
    renderMatrix([task({ title: "Filed", status: "completed" as TaskStatus, completedAt: "2026-08-27T10:00:00.000Z" })]);

    const check = boxOne().querySelector(".tm-task-check input") as HTMLInputElement;
    expect(check.checked).toBe(true);
    expect(check.getAttribute("aria-label")).toBe("Reopen Filed");
  });

  it("is opened from the row, not from a control wrapped around a control", async () => {
    // The card used to be a `role="button"` with a checkbox and a title button
    // inside it: a control inside a control, which a keyboard cannot describe
    // and a screen reader reads twice. The row's own button is the way in now,
    // and it takes every pixel of the card the checkbox does not.
    const onOpenTask = vi.fn();
    renderMatrix([task({ id: "t1", title: "Write it up" })], { onOpenTask });

    expect(card().getAttribute("role")).toBeNull();
    await userEvent.click(within(card()).getByRole("button", { name: "Open Write it up" }));
    expect(onOpenTask).toHaveBeenCalledWith("t1");
  });
});

describe("editing what a box is called", () => {
  const named = {
    I: { groupBy: "dueDate", sortKey: "dueDate", sortOrder: "asc", name: "Tuesday", hint: "before the meeting" },
  } as const;

  function openMenu() {
    return userEvent.click(boxOne().querySelector(".ff-matrix-cell-menu") as HTMLElement);
  }

  it("offers Edit as a row that opens a surface, not a set of choices", async () => {
    renderMatrix([task({ dueDate: TODAY })]);
    await openMenu();

    const items = screen.getAllByRole("menuitem").map((node) => node.textContent ?? "");
    expect(items[0]).toContain("Edit");
    // The reference's own menu draws no chevron on this one, because there is
    // nothing behind it to choose between.
    expect(items[0]).not.toContain("›");
  });

  it("opens on the box it was pressed on", async () => {
    renderMatrix([task({ dueDate: TODAY })]);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit/ }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Edit Do first")).toBeTruthy();
    // An empty field shows what leaving it empty will get you.
    expect(screen.getByLabelText("Name").getAttribute("placeholder")).toBe("Do first");
  });

  it("hands the typed name up without touching how the box is ordered", async () => {
    const onChangeQuadrantView = vi.fn();
    renderMatrix([task({ dueDate: TODAY })], { onChangeQuadrantView });

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit/ }));
    await userEvent.type(screen.getByLabelText("Name"), "  Tuesday  ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onChangeQuadrantView).toHaveBeenCalledWith("I", {
      groupBy: "dueDate",
      sortKey: "dueDate",
      sortOrder: "asc",
      name: "Tuesday",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says the stored name everywhere the box is named", () => {
    // One rule, three places: a header that disagrees with its own buttons'
    // labels is a box a screen reader and an eye cannot both find.
    renderMatrix([task({ dueDate: TODAY })], { quadrantViews: named });

    expect(boxOne().querySelector(".ff-matrix-cell-title")?.textContent).toBe("Tuesday");
    expect(boxOne().querySelector(".ff-matrix-cell-hint")?.textContent).toBe("before the meeting");
    expect(screen.getByRole("button", { name: "Add a task to Tuesday" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tuesday settings" })).toBeTruthy();
  });

  it("gives the box back its own words", async () => {
    const onChangeQuadrantView = vi.fn();
    renderMatrix([task({ dueDate: TODAY })], { quadrantViews: named, onChangeQuadrantView });

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit/ }));
    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    // Cleared, not stored as "": absent is what "never named" means.
    expect(onChangeQuadrantView).toHaveBeenCalledWith("I", {
      groupBy: "dueDate",
      sortKey: "dueDate",
      sortOrder: "asc",
    });
  });

  it("keeps the typed name when the dialog is cancelled", async () => {
    const onChangeQuadrantView = vi.fn();
    renderMatrix([task({ dueDate: TODAY })], { onChangeQuadrantView });

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit/ }));
    await userEvent.type(screen.getByLabelText("Name"), "Never saved");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onChangeQuadrantView).not.toHaveBeenCalled();
    expect(boxOne().querySelector(".ff-matrix-cell-title")?.textContent).toBe("Do first");
  });

  it("paints the chosen colour on the box, which carries it to the checkbox", () => {
    // Phase 4 hung the checkbox border and the quick-add outline on this one
    // variable, so one override moves all three.
    renderMatrix([task({ dueDate: TODAY })], {
      quadrantViews: { I: { groupBy: "dueDate", sortKey: "dueDate", sortOrder: "asc", color: "indigo" } },
    });

    expect(boxOne().style.getPropertyValue("--q-color")).toBe("#5b5bd6");
  });
});

describe("boxes made of rules", () => {
  /** Ⅰ takes only work that is already late; the other three are untouched. */
  const lateOnly: Partial<MatrixQuadrantRules> = {
    I: { listIds: [], tagIds: [], dateBuckets: ["overdue"], priorities: ["high"] },
  };

  function dragOver(box: HTMLElement, taskId: string) {
    const dataTransfer = {
      types: ["text/task"],
      getData: () => taskId,
      setData: () => {},
      effectAllowed: "move",
    };
    fireEvent.dragStart(document.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement, { dataTransfer });
    fireEvent.dragOver(box, { dataTransfer });
  }

  it("draws the same four boxes when nobody has written a rule", () => {
    // The claim 6a was built to keep: the default rule IS the priority
    // mapping, so an untouched account sees what it always saw.
    renderMatrix([task({ title: "High one", priority: "high" })]);

    expect(within(boxOne()).getByText("High one")).toBeTruthy();
    expect(document.querySelector(".ff-matrix-unmatched")).toBeNull();
  });

  it("keeps a task the rules do not claim, under the grid rather than inside it", async () => {
    renderMatrix(
      [task({ title: "Not late", priority: "high", dueDate: "2026-09-30" })],
      { quadrantRules: lateOnly },
    );

    // Not in any box — Ⅰ wants overdue, and Ⅱ..Ⅳ want other priorities.
    expect(within(boxOne()).queryByText("Not late")).toBeNull();
    // …and not gone. That distinction is the whole reason this strip exists.
    const strip = document.querySelector(".ff-matrix-unmatched") as HTMLElement;
    expect(strip).toBeTruthy();
    // Outside the 2x2: a fifth box inside it would be the mistake this screen
    // was built to stop making.
    expect(document.querySelector(".ff-matrix")?.contains(strip)).toBe(false);

    // Shut by default, because it reports a configuration rather than a to-do.
    expect(within(strip).queryByText("Not late")).toBeNull();
    await userEvent.click(within(strip).getByRole("button", { name: /in no box/ }));
    expect(within(strip).getByText("Not late")).toBeTruthy();
  });

  it("says how many, and disappears when there are none", () => {
    renderMatrix(
      [
        task({ id: "a", title: "A", priority: "high", dueDate: "2026-09-30" }),
        task({ id: "b", title: "B", priority: "high", dueDate: "2026-09-30" }),
        task({ id: "c", title: "C", priority: "high", dueDate: "2026-08-20" }),
      ],
      { quadrantRules: lateOnly },
    );

    expect(screen.getByRole("button", { name: "2 tasks in no box" })).toBeTruthy();
    // The overdue one is claimed by Ⅰ and is not in the remainder.
    expect(within(boxOne()).getByText("C")).toBeTruthy();
  });

  it("refuses a card it would have to move between Lists, and says why", () => {
    const onUpdateTask = vi.fn();
    renderMatrix(
      [task({ id: "t-home", title: "Home thing", priority: "high", listId: "list-home" })],
      {
        lists: [{ id: "list-home", name: "Home" } as List, { id: "list-work", name: "Work" } as List],
        quadrantRules: { II: { listIds: ["list-work"], tagIds: [], dateBuckets: [], priorities: [] } },
        onUpdateTask,
      },
    );

    const two = document.querySelector(".ff-matrix-cell-II") as HTMLElement;
    dragOver(two, "t-home");

    expect(two.className).toContain("is-refusing");
    expect(within(two).getByText(/only takes tasks from another List/)).toBeTruthy();
    // The refusal is spoken before the drop — and honoured by it.
    fireEvent.drop(two, { dataTransfer: { types: ["text/task"], getData: () => "t-home" } });
    expect(onUpdateTask).not.toHaveBeenCalled();
  });

  it("refuses rather than erasing a deadline", () => {
    // §4.2's accident, in the one place a rule could bring it back.
    const onUpdateTask = vi.fn();
    renderMatrix([task({ id: "dated", title: "Dated", priority: "high", dueDate: "2026-09-30" })], {
      quadrantRules: { II: { listIds: [], tagIds: [], dateBuckets: ["none"], priorities: [] } },
      onUpdateTask,
    });

    const two = document.querySelector(".ff-matrix-cell-II") as HTMLElement;
    dragOver(two, "dated");

    expect(within(two).getByText(/will not erase a deadline/)).toBeTruthy();
    fireEvent.drop(two, { dataTransfer: { types: ["text/task"], getData: () => "dated" } });
    expect(onUpdateTask).not.toHaveBeenCalled();
  });

  it("still accepts a card the rule can be satisfied for", () => {
    const onUpdateTask = vi.fn();
    renderMatrix([task({ id: "movable", title: "Movable", priority: "high" })], {
      quadrantRules: { II: { listIds: [], tagIds: [], dateBuckets: [], priorities: ["medium", "low"] } },
      onUpdateTask,
    });

    const two = document.querySelector(".ff-matrix-cell-II") as HTMLElement;
    dragOver(two, "movable");

    expect(two.className).not.toContain("is-refusing");
    fireEvent.drop(two, { dataTransfer: { types: ["text/task"], getData: () => "movable" } });
    // Entered as the stronger of the two the box accepts.
    expect(onUpdateTask).toHaveBeenCalledWith("movable", { priority: "medium" });
  });

  it("makes a new task match the box it was typed into", async () => {
    const onCreateTask = vi.fn(() => "made");
    renderMatrix([], {
      quadrantRules: { I: { listIds: [], tagIds: [], dateBuckets: ["today"], priorities: ["high"] } },
      onCreateTask,
    });

    await userEvent.click(screen.getByRole("button", { name: "Add a task to Do first" }));
    await userEvent.type(screen.getByRole("textbox", { name: "What belongs in this box?" }), "Due now{Enter}");

    // The box wants today, so the task is born today — otherwise typing into a
    // box would make something the box then has to hide.
    expect(onCreateTask).toHaveBeenCalledWith({
      title: "Due now",
      status: "open",
      priority: "high",
      dueDate: TODAY,
    });
  });
});

describe("editing what gets into a box", () => {
  const workList = [{ id: "list-work", name: "Work" } as List];

  async function openEditor(handlers: Partial<Parameters<typeof MatrixPage>[0]> = {}) {
    renderMatrix([task({ dueDate: TODAY })], { lists: workList, ...handlers });
    await userEvent.click(boxOne().querySelector(".ff-matrix-cell-menu") as HTMLElement);
    await userEvent.click(screen.getByRole("menuitem", { name: /Edit/ }));
  }

  it("separates what the box is called from what gets into it", async () => {
    await openEditor();

    // Only the second half can hide a task, so the dialog says where it starts.
    expect(screen.getByText("What gets into this box")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Lists" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Dates" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Priorities" })).toBeTruthy();
    // No Note record exists in this app, so the reference's fifth row is not
    // offered (§22.4).
    expect(screen.queryByRole("group", { name: /Task type/i })).toBeNull();
    // Nor a tag row on an account with no tags: one dead option is not a row.
    expect(screen.queryByRole("group", { name: "Tags" })).toBeNull();
  });

  it("opens showing the rule in force, with 'Any' meaning no condition", async () => {
    await openEditor();

    const dates = within(screen.getByRole("group", { name: "Dates" }));
    // Ⅰ's default rule constrains priority only, so every other row is "Any".
    expect((dates.getByRole("checkbox", { name: "Any" }) as HTMLInputElement).checked).toBe(true);

    const priorities = within(screen.getByRole("group", { name: "Priorities" }));
    expect((priorities.getByRole("checkbox", { name: "High" }) as HTMLInputElement).checked).toBe(true);
    expect((priorities.getByRole("checkbox", { name: "Any" }) as HTMLInputElement).checked).toBe(false);
  });

  it("hands the rule up beside the view, kept in separate stores", async () => {
    const onChangeQuadrantView = vi.fn();
    const onChangeQuadrantRule = vi.fn();
    await openEditor({ onChangeQuadrantView, onChangeQuadrantRule });

    const dates = within(screen.getByRole("group", { name: "Dates" }));
    await userEvent.click(dates.getByRole("checkbox", { name: "Overdue" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onChangeQuadrantRule).toHaveBeenCalledWith("I", {
      listIds: [],
      tagIds: [],
      dateBuckets: ["overdue"],
      priorities: ["high"],
    });
    // How a box is drawn is a different question and did not move.
    expect(onChangeQuadrantView).toHaveBeenCalledWith("I", {
      groupBy: "dueDate",
      sortKey: "dueDate",
      sortOrder: "asc",
    });
  });

  it("clears the other values when 'Any' is chosen", async () => {
    const onChangeQuadrantRule = vi.fn();
    await openEditor({ onChangeQuadrantRule });

    const priorities = within(screen.getByRole("group", { name: "Priorities" }));
    await userEvent.click(priorities.getByRole("checkbox", { name: "Any" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    // "Any" is the EMPTY selection, not a ninth value — one representation for
    // "no constraint", so the two cannot disagree.
    expect(onChangeQuadrantRule).toHaveBeenCalledWith("I", {
      listIds: [],
      tagIds: [],
      dateBuckets: [],
      priorities: [],
    });
  });

  it("warns while it is being typed that two boxes now claim the same task", async () => {
    await openEditor();

    expect(screen.queryByText(/Overlaps/)).toBeNull();
    const priorities = within(screen.getByRole("group", { name: "Priorities" }));
    await userEvent.click(priorities.getByRole("checkbox", { name: "Medium" }));

    // Ⅱ is medium by default, so Ⅰ now collides with it — and Ⅰ wins, being
    // first in reading order.
    expect(screen.getByText(/Overlaps Schedule/)).toBeTruthy();
    expect(screen.getByText(/appear in Do first/)).toBeTruthy();
    // Warned, never blocked: an app that refuses the arrangement someone asked
    // for is worse than one that resolves it predictably and says how.
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("puts the box's own conditions back, not just its name", async () => {
    const onChangeQuadrantRule = vi.fn();
    await openEditor({
      quadrantRules: { I: { listIds: ["list-work"], tagIds: [], dateBuckets: [], priorities: ["high"] } },
      onChangeQuadrantRule,
    });

    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onChangeQuadrantRule).toHaveBeenCalledWith("I", {
      listIds: [],
      tagIds: [],
      dateBuckets: [],
      priorities: ["high"],
    });
  });

  it("says out loud that a preset reaches past the box being edited", async () => {
    const onApplyRulePreset = vi.fn();
    await openEditor({ onApplyRulePreset });

    await userEvent.click(screen.getByRole("button", { name: "Presets" }));
    expect(screen.getByText("Replaces the rules for all four boxes.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Time + priority" }));

    // The rule this app deleted in Phase 1, back as a choice someone makes.
    expect(onApplyRulePreset).toHaveBeenCalledWith(
      expect.objectContaining({
        I: expect.objectContaining({ dateBuckets: ["overdue", "today", "tomorrow"], priorities: ["high", "medium"] }),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the List picker beside the boxes' own conditions", () => {
  const twoLists = [
    { id: "list-work", name: "Work" } as List,
    { id: "list-home", name: "Home" } as List,
  ];
  /** Ⅰ takes Work only, which the picker can be pointed away from. */
  const workOnly: Partial<MatrixQuadrantRules> = {
    I: { listIds: ["list-work"], tagIds: [], dateBuckets: [], priorities: ["high"] },
  };

  async function viewList(name: string) {
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /List/ }), name);
  }

  it("says which List a count was taken within", async () => {
    renderMatrix(
      [
        task({ id: "w", title: "Work one", priority: "medium", listId: "list-work" }),
        task({ id: "h", title: "Home one", priority: "medium", listId: "list-home" }),
      ],
      { lists: twoLists, quadrantRules: { II: { listIds: [], tagIds: [], dateBuckets: ["overdue"], priorities: [] } } },
    );

    // Both are unmatched: Ⅱ wants overdue, and Ⅰ/Ⅲ/Ⅳ want other priorities.
    expect(screen.getByRole("button", { name: "2 tasks in no box" })).toBeTruthy();

    // A number that halves when a List is picked, with no word about why, is a
    // number that cannot be trusted twice.
    await viewList("Work");
    expect(screen.getByRole("button", { name: "1 tasks in no box, within Work" })).toBeTruthy();
  });

  it("explains a box the picker has emptied, which neither control says alone", async () => {
    renderMatrix([task({ priority: "high", listId: "list-work" })], {
      lists: twoLists,
      quadrantRules: workOnly,
    });

    expect(within(boxOne()).queryByText(/only takes other Lists/)).toBeNull();

    await viewList("Home");

    // The picker says "Home" and the rule says "Work"; the box is where those
    // two halves of the answer finally meet.
    expect(within(boxOne()).getByText(/You are viewing Home/)).toBeTruthy();
  });

  it("takes away the + that could only make an invisible task", async () => {
    // The rule's own List wins over the picker when a task is typed into a
    // box, so this + would have written a task into Work while the screen was
    // showing Home — saved, and on no screen.
    const onCreateTask = vi.fn(() => "made");
    renderMatrix([], { lists: twoLists, quadrantRules: workOnly, onCreateTask });

    expect(screen.getByRole("button", { name: "Add a task to Do first" })).toBeTruthy();

    await viewList("Home");

    expect(screen.queryByRole("button", { name: "Add a task to Do first" })).toBeNull();
    // The other three boxes name no List, so they are untouched.
    expect(screen.getByRole("button", { name: "Add a task to Schedule" })).toBeTruthy();
    expect(onCreateTask).not.toHaveBeenCalled();
  });

  it("leaves every box alone when the rules name no List", async () => {
    renderMatrix([], { lists: twoLists });

    await viewList("Home");

    expect(screen.getAllByRole("button", { name: /^Add a task to / })).toHaveLength(4);
    expect(document.querySelector(".ff-matrix-cell-refusal")).toBeNull();
  });
});
