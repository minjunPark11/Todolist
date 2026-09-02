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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { FocusQueue } from "./FocusQueue";
import type { TodayEntry } from "../../utils/todayView";
import type { Task } from "../../types";
import type { TodayGroupAxis } from "../../domain/view/todayGroups";

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

function renderQueue(
  entries: TodayEntry[],
  showCompleted = true,
  axis: TodayGroupAxis = "date",
  lists: never[] = [],
) {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
      <FocusQueue
        entries={entries}
        hasQuery={false}
        query=""
        today={TODAY}
        groupAxis={axis}
        lists={lists}
        onPostponeOverdue={() => {}}
        openedTaskId=""
        showCompleted={showCompleted}
        onToggleDone={() => {}}
        onOpenTask={() => {}}
        onMoveBucket={() => {}}
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

/** An entry filed in one of the plan's three boxes. */
function bucketed(
  id: string,
  bucket: "now" | "next" | "later",
  completed = false,
  over: Partial<Task> = {},
): TodayEntry {
  return { ...entry(id, over, completed), bucket, defaultBucket: bucket };
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

// §3.6: the title is read first, and everything else sits at the far end.
describe("what a row says beside its title", () => {
  const withList = (rows: TodayEntry[]) =>
    renderQueue(rows, true, "date", [
      { id: "l1", name: "학교", kind: "regular" } as never,
    ]);

  it("carries the list, the date, and a mark for a body it has", () => {
    withList([entry("lab", { listId: "l1", dueDate: "2026-08-20", description: "notes" })]);

    const meta = document.querySelector(".tdy-row-meta") as HTMLElement;
    expect(meta).toBeTruthy();
    expect(meta.querySelector(".tdy-row-list")?.textContent).toBe("학교");
    expect(meta.querySelector(".tdy-row-due")?.textContent).toBeTruthy();
    expect(meta.querySelector(".tdy-row-tip")).toBeTruthy();
  });

  it("marks a late date and leaves a finished one alone", () => {
    withList([entry("late", { listId: "l1", dueDate: "2026-08-20" })]);
    expect(document.querySelector(".tdy-row-due.is-overdue")).toBeTruthy();

    cleanup();
    // §19.5: a red date under a strike-through is an alarm about a job that is
    // already over. The finished group starts folded (§3.4), so this has to
    // open it before there is a row to read.
    withList([entry("done", { listId: "l1", dueDate: "2026-08-20" }, true)]);
    // `fireEvent`, not a raw `.click()`: outside `act` React does not flush the
    // state change and the row would still be behind the fold.
    fireEvent.click(document.querySelector(".tdy-bucket-toggle") as HTMLButtonElement);
    expect(document.querySelector(".tdy-row-due")).toBeTruthy();
    expect(document.querySelector(".tdy-row-due.is-overdue")).toBeNull();
  });

  // The group above it already said it. Saying it again on every row under
  // that header is the screen making one statement twice.
  it("drops the Overdue badge on the date axis, and keeps it on the plan axis", () => {
    // `reason` is a field on the entry — `collectTodayEntries` works it out
    // before the list ever sees it — so a fixture has to say so.
    const late = { ...entry("late", { dueDate: "2026-08-20" }), reason: "overdue" } as TodayEntry;

    renderQueue([late], true, "date");
    expect(document.querySelector(".tdy-reason-overdue")).toBeNull();

    cleanup();
    renderQueue([{ ...late, bucket: "now", defaultBucket: "now" } as TodayEntry], true, "plan");
    expect(document.querySelector(".tdy-reason-overdue")).toBeTruthy();
  });

  it("keeps the other reasons on both axes", () => {
    renderQueue([{ ...entry("wait"), reason: "waiting" } as TodayEntry], true, "date");
    expect(document.querySelector(".tdy-reason-waiting")).toBeTruthy();
  });
});

// §1.3's caret, and §3.4's "완료됨 ← 접힘".
describe("folding a group", () => {
  it("starts open, and folds when the header is clicked", async () => {
    const user = userEvent.setup();
    renderQueue([entry("due", { dueDate: TODAY })]);

    expect(document.querySelectorAll(".tdy-row")).toHaveLength(1);
    await user.click(screen.getByRole("button", { expanded: true }));
    expect(document.querySelectorAll(".tdy-row")).toHaveLength(0);
    // The count stays on the header: what a fold hides is the rows, not how
    // many there are.
    expect(countFor("Today")).toBe("1");
  });

  // This is a WORKING surface. Remaining work sliding down under finished work
  // is the worst thing that can happen on a screen whose whole question is
  // what is left — the Inbox board's split rather than the Matrix's.
  it("starts the finished group folded and the rest open", () => {
    renderQueue([entry("due", { dueDate: TODAY }), entry("done", { dueDate: TODAY }, true)]);

    const toggles = [...document.querySelectorAll(".tdy-bucket-toggle")];
    expect(toggles.map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    // One row drawn: the open one. The finished one is behind its caret.
    expect(document.querySelectorAll(".tdy-row")).toHaveLength(1);
  });
});

describe("the Overdue group's own action", () => {
  // §3.5: it belongs to that group and to no other. The rest of the day is
  // work whose date is already what the reader meant.
  it("is drawn on Overdue only", () => {
    renderQueue([
      entry("late", { dueDate: "2026-08-25" }),
      entry("due", { dueDate: TODAY }),
      entry("done", { dueDate: TODAY }, true),
    ]);

    const heads = [...document.querySelectorAll(".tdy-bucket-head")];
    const withAction = heads.filter((head) => head.querySelector(".tdy-bucket-action"));
    expect(withAction).toHaveLength(1);
    expect(withAction[0].querySelector("strong")?.textContent).toBe("Overdue");
  });

  it("is absent on a day with nothing late", () => {
    renderQueue([entry("due", { dueDate: TODAY })]);
    expect(document.querySelector(".tdy-bucket-action")).toBeNull();
  });

  // On the plan axis there is no Overdue group at all, so there is nothing to
  // draw it on — the action follows the group, not the screen.
  it("is absent on the plan axis", () => {
    renderQueue([bucketed("late", "now", false, { dueDate: "2026-08-25" })], true, "plan");
    expect(document.querySelector(".tdy-bucket-action")).toBeNull();
  });
});

// §3.4: the plan's boxes did not go away when the dates arrived — they became
// the other way to read the same day.
describe("the plan axis", () => {
  it("groups by the box the task was put in", () => {
    renderQueue(
      [
        bucketed("a", "later"),
        bucketed("b", "now"),
        bucketed("c", "next"),
      ],
      true,
      "plan",
    );
    expect(headings()).toEqual(["Now", "Next", "Later"]);
  });

  // The one rule both axes share, and the one that makes "완료" a group rather
  // than a filter: a task finished this morning is not waiting in a box.
  it("still files finished work under Completed", () => {
    renderQueue([bucketed("done", "now", true)], true, "plan");
    expect(headings()).toEqual(["Completed"]);
  });

  it("draws no box that is empty", () => {
    renderQueue([bucketed("only", "next")], true, "plan");
    expect(headings()).toEqual(["Next"]);
  });

  // The dates say nothing here. A task three weeks late sits in whichever box
  // the reader filed it in, because that is the question they asked.
  it("does not reach for the date at all", () => {
    renderQueue([bucketed("late", "later", false, { dueDate: "2026-08-01" })], true, "plan");
    expect(headings()).toEqual(["Later"]);
  });
});
