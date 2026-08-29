// @vitest-environment jsdom
//
// The schedule trigger says how late a task is
// (TASK_DETAIL_SCHEDULE_BODY_DESIGN.md G4).
//
// The date was already red on an overdue task, but red says THAT it is late
// and not by how much — "5월 20일" costs the reader a subtraction to find out.
// The one thing that must not happen is saying it about finished work: a task
// completed last week is not late by any of its dates, which is the rule
// `matrixGroupOf` follows when it refuses to file completed work as overdue.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { SchedulePicker } from "./SchedulePicker";

afterEach(cleanup);

const TODAY = "2026-08-29";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    listId: "list-inbox",
    tags: [],
    ...overrides,
  } as Task;
}

function setup(overrides: Partial<Task> = {}) {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <SchedulePicker task={task(overrides)} reminders={[]} today={TODAY} onCommit={() => []} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return document.querySelector(".sched-trigger") as HTMLElement;
}

describe("the schedule trigger", () => {
  it("counts the days once the date has passed", () => {
    const trigger = setup({ dueDate: "2026-08-20" });
    expect(trigger.textContent).toContain("9d overdue");
    expect(trigger.className).toContain("is-late");
  });

  it("says nothing of the kind about work that is not late", () => {
    const trigger = setup({ dueDate: "2026-09-05" });
    expect(trigger.textContent).not.toContain("overdue");
    expect(trigger.className).not.toContain("is-late");
  });

  it("does not call finished work late", () => {
    // It keeps its dates and one of them has passed — and none of that is a
    // claim on anybody's time any more.
    const trigger = setup({ dueDate: "2026-08-20", status: "done", completedAt: "2026-08-21T00:00:00.000Z" });
    expect(trigger.textContent).not.toContain("overdue");
    expect(trigger.className).not.toContain("is-late");
  });

  it("puts the count in the accessible name too, not only in the pixels", () => {
    setup({ dueDate: "2026-08-20" });
    expect(screen.getByRole("button", { name: /9d overdue/ })).toBeTruthy();
  });

  it("draws its calendar rather than spelling it", () => {
    const trigger = setup({ dueDate: "2026-08-20" });
    expect(trigger.querySelector("svg")).toBeTruthy();
    expect(/\p{Extended_Pictographic}/u.test(trigger.textContent ?? "")).toBe(false);
  });

  it("stays an invitation when there is no schedule at all", () => {
    const trigger = setup();
    expect(trigger.className).toContain("is-empty");
    expect(trigger.textContent).not.toContain("overdue");
  });
});
