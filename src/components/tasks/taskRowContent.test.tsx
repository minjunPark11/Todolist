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
