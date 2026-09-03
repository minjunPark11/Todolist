// @vitest-environment jsdom
//
// The one row (TICKTICK_MATRIX_DESIGN.md §15 Q4, closed in §28).
//
// Four views drew a task and each of them drew a different task: the List had
// a flag and a raw stored date, the Board had a title, the matrix had icons
// and a formatted date and a tick of its own. These tests fix what the row
// says now that there is one of it — and, where the two surfaces genuinely
// differ, that the difference is asked for by the caller rather than built
// into a second component.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { TaskRowContent } from "./TaskRowContent";

afterEach(cleanup);

const TODAY = "2026-08-31";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Read ch. 4",
    status: "todo",
    listId: "school",
    priority: "none",
    tags: [],
    ...overrides,
  } as Task;
}

function draw(overrides: Partial<Task> = {}, props: Partial<Parameters<typeof TaskRowContent>[0]> = {}) {
  render(
    <I18nProvider lang="en">
      <TaskRowContent
        task={task(overrides)}
        today={TODAY}
        onOpen={vi.fn()}
        onToggleDone={vi.fn()}
        {...props}
      />
    </I18nProvider>,
  );
}

// Trash §13 (Q3). A child is a row in exactly one Scope, and there it looked
// like any top-level task — so restoring one put it back somewhere the reader
// was not looking and it read as having vanished.
describe("a row that is somebody's child", () => {
  it("says whose, in the same cluster as the List name", () => {
    draw({ dueDate: "" }, { parentTitle: "Ship the release" });

    const chip = screen.getByTitle("Subtask of Ship the release");
    expect(chip.textContent).toContain("Ship the release");
    // The arrow is decoration on top of the name, not part of it — a screen
    // reader gets the sentence from the title instead.
    expect(chip.querySelector("[aria-hidden=\"true\"]")).toBeTruthy();
  });

  it("draws nothing where the row is nobody's child", () => {
    draw();
    expect(document.querySelector(".tm-task-parent")).toBeNull();
  });
});

// §13.7. `Task Time` was `formatDate` and nothing else, so the row wrote
// `Sep 7` where the reference app writes `Next Mon`. TODAY is a Monday.
describe("Show Date by: Task Time", () => {
  it("uses the word for the days that have one", () => {
    draw({ dueDate: TODAY });
    expect(screen.getByText("Today")).toBeTruthy();

    cleanup();
    draw({ dueDate: "2026-09-01" });
    expect(screen.getByText("Tomorrow")).toBeTruthy();
  });

  it("names the weekday inside this week, and marks the next one", () => {
    // Fri Sep 4, four days out and in this same week (it starts Sunday).
    draw({ dueDate: "2026-09-04" });
    expect(screen.getByText("Fri")).toBeTruthy();

    cleanup();
    // Sun Sep 6 begins the week after.
    draw({ dueDate: "2026-09-06" });
    expect(screen.getByText("Next Sun")).toBeTruthy();
  });

  it("writes the date where there is no name to use", () => {
    // A week out is far enough that `Mon` would be the wrong Monday.
    draw({ dueDate: "2026-09-07" });
    expect(screen.getByText("Sep 7")).toBeTruthy();

    cleanup();
    // And behind, where the reference falls back to a date too. Still red:
    // the colour is the deadline being missed, not the words used for it.
    draw({ dueDate: "2026-08-20" });
    const late = screen.getByText("Aug 20");
    expect(late.className).toContain("is-overdue");
  });

  // `short` in Korean is the single letter `월`, which is also the word for
  // `month` — `다음 주 월` reads as a sentence that stops halfway. The long
  // form costs three characters there, against nine for `Monday`.
  it("writes a Korean weekday in full", () => {
    render(
      <I18nProvider lang="ko">
        <TaskRowContent
          task={task({ dueDate: "2026-09-06" })}
          today={TODAY}
          onOpen={vi.fn()}
          onToggleDone={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("다음 주 일요일")).toBeTruthy();
  });

  // The other half of the setting is untouched by all this: it replaces the
  // date rather than joining it, so only one of the two is ever on the row.
  it("gives way to the countdown when that is what was asked for", () => {
    draw({ dueDate: "2026-09-06" }, { dateBy: "countdown" });
    expect(screen.getByText("6d left")).toBeTruthy();
    expect(screen.queryByText("Next Sun")).toBeNull();
  });
});

describe("what a row says about a task", () => {
  it("carries all three tips, not the one the List used to have", () => {
    // COMPONENT_06 §7 measured date + note + repeat on a single reference row.
    // Ours drew the date and dropped the other two everywhere except the
    // matrix, so a repeating task and a task with a page of notes behind it
    // looked exactly like a bare one.
    draw({ dueDate: "2026-09-20", repeatType: "weekly", notes: "the outline" });

    expect(screen.getByRole("img", { name: "Repeats" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Has notes" })).toBeTruthy();
    expect(screen.getByText("Sep 20")).toBeTruthy();
  });

  it("counts either body as a body", () => {
    // `contentMode` decides which field a task is using; the row only reports
    // that there is more behind the title.
    draw({ description: "why" });
    expect(screen.getByRole("img", { name: "Has notes" })).toBeTruthy();

    cleanup();
    draw({ notes: "   " });
    expect(screen.queryByRole("img", { name: "Has notes" })).toBeNull();
  });

  it("writes the date as a date, not as the string it is stored as", () => {
    draw({ dueDate: "2026-09-20" });

    expect(screen.queryByText("2026-09-20")).toBeNull();
    expect(screen.getByText("Sep 20")).toBeTruthy();
  });

  it("says a deadline has passed", () => {
    draw({ dueDate: "2026-08-20" });

    expect(screen.getByText("Aug 20").className).toContain("is-overdue");
  });

  it("stops saying it once the work is done", () => {
    // Red is "go and do this", and this one has been done. The date stays,
    // because which day it was is the reason the row is read afterwards.
    draw({ dueDate: "2026-08-20", status: "completed", completedAt: "2026-08-27T10:00:00.000Z" });

    const due = screen.getByText("Aug 20");
    expect(due.className).not.toContain("is-overdue");
  });

  it("takes today from the caller, so it cannot disagree with the group it sits in", () => {
    // The matrix groups by date and then draws the cards. If the row worked
    // out "late" for itself it could contradict the header directly above it.
    draw({ dueDate: "2026-08-20" }, { today: "2026-08-01" });

    expect(screen.getByText("Aug 20").className).not.toContain("is-overdue");
  });
});

describe("what the caller decides", () => {
  it("names the List only where the row is asked to", () => {
    draw({}, { listName: "School" });
    expect(screen.getByText("School")).toBeTruthy();

    cleanup();
    draw();
    expect(screen.queryByText("School")).toBeNull();
  });

  it("leaves the flag off where the row's place is already the priority", () => {
    // D1: every card in a matrix box has that box's priority, so the flag
    // would be the header repeated once per card. The task is unchanged —
    // this is the view declining to draw it, not the record losing it.
    draw({ priority: "high" }, { showPriority: false });
    expect(screen.queryByLabelText("High")).toBeNull();

    cleanup();
    draw({ priority: "high" });
    expect(screen.getByLabelText("High")).toBeTruthy();
  });

  it("offers a checkbox that reports the record, and asks rather than deciding", () => {
    const onToggleDone = vi.fn();
    draw({ status: "completed", completedAt: "2026-08-27T10:00:00.000Z" }, { onToggleDone });

    const box = screen.getByRole("checkbox", { name: "Reopen Read ch. 4" }) as HTMLInputElement;
    expect(box.checked).toBe(true);

    box.click();
    expect(onToggleDone).toHaveBeenCalledTimes(1);
  });
});

// TASK_PRIORITY_CHECKBOX_DESIGN.md §4. The colour itself is the stylesheet's;
// what this file can hold is that the box is TOLD which level it is drawing,
// and that it is told by the same switch the flag listens to.
describe("the checkbox says the priority (§4.1)", () => {
  const box = () => document.querySelector(".tm-check") as HTMLElement;

  it("carries the level as a class, for each of the four", () => {
    for (const level of ["high", "medium", "low", "none"] as const) {
      draw({ priority: level });
      expect(box().className).toBe(`tm-check is-${level}`);
      cleanup();
    }
  });

  it("says nothing where the row's place is already the priority", () => {
    // The same rule the flag follows — one switch, so the matrix's quadrants
    // are not repeated in two channels per card rather than none.
    draw({ priority: "high" }, { showPriority: false });
    expect(box().className).toBe("tm-check is-none");
  });

  it("leaves the priority out of the box's name", () => {
    // The flag beside it already carries the level for a screen reader. Said
    // twice, a reader has to work out whether they heard two facts or one.
    draw({ priority: "high" });
    expect(screen.getByRole("checkbox", { name: "Complete Read ch. 4" })).toBe(box());
  });
});

// A note is an item with no completion (QUICK_ADD_INPUT_BOX_DESIGN.md §7.1).
describe("a note among the tasks", () => {
  it("draws no checkbox, and keeps the slot so the titles still line up", () => {
    draw({ kind: "note" } as never);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.querySelector(".tm-task-check.is-note")).toBeTruthy();
  });

  it("is still a row that opens", () => {
    // Everything else a task has, a note has: a List, a date, tags, a body.
    draw({ kind: "note" } as never);
    expect(screen.getByRole("button", { name: "Open Read ch. 4" })).toBeTruthy();
  });
});
