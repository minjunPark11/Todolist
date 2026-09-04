// The timeline's `Show completed` switch actually switching something.
//
// The bug was not in the view — `TaskGanttView` filters its own `items` on
// `showDone` and always did. It was one level up: `TasksModule` fed the
// timeline `queryScopeTasks(scope, ctx)`, which drops finished work before
// anything sees it, so the switch governed a set the finished tasks had
// already been removed from. Ticking it changed nothing.
//
// That makes this an E2E rather than a component test: the claim is about
// which query the module hands the view, and rendering the view with items
// chosen by the test would assert the half that was never broken.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const NOW = "2026-08-18T00:00:00.000Z";

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openGantt(page: Page): Promise<void> {
  await openApp(page, { lists: [{ id: "l-work", name: "Work" }] });
  await page.evaluate(
    ([key, now, openStart, openEnd, doneStart, doneEnd]) => {
      const store = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      const base = {
        description: "",
        priority: "none",
        startTime: "",
        endTime: "",
        projectId: "",
        categoryId: "",
        parentTaskId: "",
        tags: [],
        notes: "",
        estimatedMinutes: 0,
        actualSeconds: 0,
        activeSessionId: "",
        lastFocusedAt: "",
        isSomeday: false,
        waitingReason: "",
        waitingFollowUpDate: "",
        blockedByTaskId: "",
        repeatType: "none",
        listId: "l-work",
        createdAt: now as string,
        updatedAt: now as string,
        deletedAt: "",
      };
      store.tasks = [
        {
          ...base,
          id: "g-open",
          title: "Still going",
          status: "todo",
          completedAt: "",
          startDate: openStart as string,
          dueDate: openEnd as string,
          order: 0,
        },
        {
          ...base,
          id: "g-done",
          title: "Already finished",
          status: "completed",
          completedAt: now as string,
          startDate: doneStart as string,
          dueDate: doneEnd as string,
          order: 1,
        },
      ];
      window.localStorage.setItem(key as string, JSON.stringify(store));
    },
    [STORAGE_KEY, NOW, dayOffset(-1), dayOffset(4), dayOffset(-5), dayOffset(-2)] as const,
  );
  await page.goto("/list/l-work?view=gantt");
  await expect(page.locator(".ff-timeline")).toBeVisible();
}

function rowLabels(page: Page) {
  return page.locator(".ff-timeline-label-text");
}

function showCompleted(page: Page) {
  return page.locator(".ff-timeline-toggle input[type='checkbox']");
}

test.describe("the timeline's completed work", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the timeline wants a desktop window");

  test("is on the grid, because the switch says so by default", async ({ page }) => {
    await openGantt(page);
    // D12: shown by default, and one click from gone. Before the fix this row
    // never arrived at all.
    await expect(showCompleted(page)).toBeChecked();
    await expect(rowLabels(page)).toHaveText(["Already finished", "Still going"]);
  });

  test("is drawn as finished rather than as ordinary work", async ({ page }) => {
    await openGantt(page);
    const done = page.locator(".ff-timeline-row", { hasText: "Already finished" }).locator(".ff-timeline-bar");
    await expect(done).toHaveClass(/is-done/);
  });

  test("goes when the switch is turned off, and the open work stays", async ({ page }) => {
    await openGantt(page);
    await showCompleted(page).uncheck();
    await expect(rowLabels(page)).toHaveText(["Still going"]);

    await showCompleted(page).check();
    await expect(rowLabels(page)).toHaveText(["Already finished", "Still going"]);
  });

  test("does not follow the task into the list view", async ({ page }) => {
    await openGantt(page);
    // The extra query is the timeline's alone: the list is still the Scope's
    // open work, which is what every other screen means by this List.
    await page.goto("/list/l-work?view=list");
    await expect(page.getByText("Still going")).toBeVisible();
    await expect(page.getByText("Already finished")).toHaveCount(0);
  });
});
