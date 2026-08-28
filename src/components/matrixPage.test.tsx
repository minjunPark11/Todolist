// @vitest-environment jsdom
//
// The grouping, as the screen actually assembles it. `matrixGroups.test.ts`
// proves the rule; this proves the box draws what the rule says — including
// the two things the rule cannot know about: the cap on finished work, and
// what happens to a card the moment it is ticked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { List, Task, TaskStatus } from "../types";
import { I18nProvider } from "../i18n";
import { FloatingLayerProvider } from "./floating";
import { MatrixPage } from "./MatrixPage";

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

    const titles = [...boxOne().querySelectorAll(".ff-matrix-card-title")].map((node) => node.textContent);
    expect(titles).toEqual(["newest", "middle", "oldest"]);
  });
});

describe("ticking a card", () => {
  it("asks to toggle rather than deciding anything itself", async () => {
    const onToggleDone = vi.fn();
    renderMatrix([task({ id: "t1", title: "Write it up", dueDate: TODAY })], { onToggleDone });

    await userEvent.click(boxOne().querySelector(".ff-check") as HTMLElement);
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
    expect([...box.querySelectorAll(".ff-matrix-card-title")].map((node) => node.textContent)).toEqual(["a", "b"]);
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
    expect(card().querySelector(".ff-matrix-card-due")?.textContent).toBe("Sep 20");
    expect(card().querySelector(".is-overdue")).toBeNull();
  });

  it("marks a deadline that has already passed", () => {
    renderMatrix([task({ dueDate: "2026-08-20" })]);

    expect(card().querySelector(".ff-matrix-card-due")?.className).toContain("is-overdue");
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

    const due = card().querySelector(".ff-matrix-card-due");
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

    const check = boxOne().querySelector(".ff-check") as HTMLElement;
    expect(check.className).toContain("checked");
    expect(check.getAttribute("aria-label")).toBe("Reopen Filed");
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
