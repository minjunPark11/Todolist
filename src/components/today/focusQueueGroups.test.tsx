// @vitest-environment jsdom
//
// What the day's list says about itself (TODAY_TICKTICK_REDESIGN.md §4 Phase 1).
//
// The groups used to be `지금 / 다음 / 나중` — the box the user put the task in
// — and the screen never said why any of it was on today's list at all.
// `scopeQuery` gathers three populations into one (§12.5.1: overdue, due
// today, planned for today) and the reader could not tell them apart.
//
// jsdom rather than the domain, because `groupIdOf` is already tested as a
// pure function in `domain/view/viewGroups.test.ts`. What is untested there is
// that THIS screen asks it, in `GROUP_ORDER`, with the empty groups dropped.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { FocusQueue } from "./FocusQueue";
import type { TodayEntry } from "../../utils/todayView";
import type { Task } from "../../types";

const TODAY = "2026-09-01";

function entry(id: string, over: Partial<Task> = {}, completed = false): TodayEntry {
  return {
    task: {
      id,
      title: id,
      status: completed ? "completed" : "open",
      priority: "none",
      dueDate: "",
      startTime: "",
      isSomeday: false,
      completedAt: completed ? `${TODAY}T09:00:00.000Z` : "",
      estimatedMinutes: 0,
      ...over,
    } as Task,
    bucket: "next",
    defaultBucket: "next",
    reason: "none",
    completed,
  } as TodayEntry;
}

function renderQueue(entries: TodayEntry[], showCompleted = true) {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
      <FocusQueue
        entries={entries}
        hasQuery={false}
        query=""
        today={TODAY}
        showCompleted={showCompleted}
        onToggleShowCompleted={() => {}}
        onToggleDone={() => {}}
        onOpenTask={() => {}}
        onMoveBucket={() => {}}
        onPlanToday={() => {}}
        onMoveAllLater={() => {}}
        onClearPlan={() => {}}
        onAddTask={() => {}}
      />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
}

/** The group headings, in the order they are drawn. */
function headings(): string[] {
  return [...document.querySelectorAll(".tdy-bucket-head strong")].map(
    (node) => node.textContent ?? "",
  );
}

function countFor(name: string): string {
  const head = [...document.querySelectorAll(".tdy-bucket-head")].find(
    (node) => node.querySelector("strong")?.textContent === name,
  );
  return head?.querySelector(".tdy-bucket-count")?.textContent ?? "";
}

afterEach(cleanup);

describe("the day's groups", () => {
  it("says why each task is on today's list", () => {
    renderQueue([
      entry("late", { dueDate: "2026-08-25" }),
      entry("due", { dueDate: TODAY }),
    ]);

    expect(headings()).toEqual(["Overdue", "Today"]);
    expect(countFor("Overdue")).toBe("1");
    expect(countFor("Today")).toBe("1");
  });

  // §12.5.1 puts three populations in one list, and the third has no deadline
  // at all — it is here because the reader planned it. `groupIdOf` alone calls
  // that "No date", which tells the reader the opposite of what they did.
  it("files a planned task with no date under Today, not under No date", () => {
    renderQueue([entry("planned", { dueDate: "" })]);
    expect(headings()).toEqual(["Today"]);
  });

  // The same trap one step further out: planned for today, due next week.
  it("files a planned task with a future deadline under Today, not Later", () => {
    renderQueue([entry("planned-ahead", { dueDate: "2026-09-20" })]);
    expect(headings()).toEqual(["Today"]);
  });

  it("draws them in GROUP_ORDER, whatever order they arrive in", () => {
    renderQueue([
      entry("done", { dueDate: TODAY }, true),
      entry("due", { dueDate: TODAY }),
      entry("late", { dueDate: "2026-08-25" }),
    ]);
    expect(headings()).toEqual(["Overdue", "Today", "Completed"]);
  });

  // Finished work is not late work. `groupIdOf` answers completion before it
  // looks at a date, and this is that rule reaching the screen: a task ticked
  // today that was due last week belongs under Completed, not Overdue.
  it("does not report finished work as overdue", () => {
    renderQueue([entry("done-late", { dueDate: "2026-08-25" }, true)]);
    expect(headings()).toEqual(["Completed"]);
  });

  // "오늘 0" is a line that costs a row and answers a question nobody asked.
  it("draws no group for a bucket that is empty", () => {
    renderQueue([entry("late", { dueDate: "2026-08-25" })]);
    expect(headings()).toEqual(["Overdue"]);
  });

  // The toggle decides whether the group is DRAWN, not what it holds — which
  // is why it can be a group like any other rather than a second code path.
  it("hides Completed when the reader has switched it off", () => {
    renderQueue([entry("due", { dueDate: TODAY }), entry("done", { dueDate: TODAY }, true)], false);
    expect(headings()).toEqual(["Today"]);
  });
});
