// The open Task in a page's own address (TASK_DETAIL_PANEL_MERGE_DESIGN.md §8).
//
// The unit tests cover the two functions; what they cannot cover is the three
// things the change exists for, because all three are the browser's: a reload
// reopening what was open, Back closing it, and a copied link landing someone
// on the same page with the same Task. jsdom has no history stack worth
// asserting against and no reload at all.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const TASK = "Write the plan";

/** Born in the matrix, which is also one of the pages that can hold it open. */
async function addTaskOnBoard(page: Page): Promise<void> {
  await page.goto("/board");
  const schedule = page.locator(".ff-matrix-cell-II");
  await schedule.getByRole("button", { name: "Add a task to Schedule" }).click();
  const field = schedule.getByRole("textbox", { name: "What belongs in this box?" });
  await field.fill(TASK);
  await field.press("Enter");
  await expect(schedule).toContainText(TASK);
}

async function openTheTask(page: Page): Promise<void> {
  await page.locator(".ff-matrix-cell-II").getByText(TASK).first().click();
  await expect(page.locator(".tm-drawer")).toBeVisible();
}

/**
 * The way out, which is the same gesture on every width again.
 *
 * It was not, for a week: the Matrix's Detail opened as a centred modal with a
 * scrim and no ✕, so this spec had to ask the surface how it closed. The popup
 * is a popover now — no scrim, and the ✕ is back on every presentation
 * (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §3.2).
 */
async function closeTheTask(page: Page): Promise<void> {
  await page.locator(".tm-drawer-close").click();
}

test.describe("a page's address carries its open Task", () => {
  test("opening writes it, closing takes it away", async ({ page }) => {
    await openApp(page);
    await addTaskOnBoard(page);
    expect(new URL(page.url()).search).toBe("");

    await openTheTask(page);
    const taskId = new URL(page.url()).searchParams.get("task");
    expect(taskId).toBeTruthy();
    expect(new URL(page.url()).pathname).toBe("/board");

    await closeTheTask(page);
    await expect(page.locator(".tm-drawer")).toHaveCount(0);
    expect(new URL(page.url()).search).toBe("");
  });

  // Escape used to clear a `useState`; it navigates now, and the guard that
  // keeps it from stacking a history entry per keystroke is easy to get wrong
  // in the direction where it never fires at all.
  test("Escape closes it, and only when something is open", async ({ page }) => {
    await openApp(page);
    await addTaskOnBoard(page);
    await openTheTask(page);

    await page.keyboard.press("Escape");
    await expect(page.locator(".tm-drawer")).toHaveCount(0);
    expect(new URL(page.url()).search).toBe("");

    // Pressing it again with nothing open must not push an entry. If it did,
    // this Back would spend itself on that duplicate `/board` and the Task
    // would still be closed.
    await page.keyboard.press("Escape");
    await page.goBack();
    expect(new URL(page.url()).searchParams.get("task")).toBeTruthy();
    await expect(page.locator(".tm-drawer")).toBeVisible();
  });

  test("a reload reopens it", async ({ page }) => {
    await openApp(page);
    await addTaskOnBoard(page);
    await openTheTask(page);

    await page.reload();
    // The whole point: before this, the reload landed on an empty Matrix
    // because the open Task was a `useState` in `usePlannerData`.
    await expect(page.locator(".tm-drawer")).toBeVisible();
    await expect(page.locator(".tm-drawer .tm-drawer-title")).toHaveValue(TASK);
  });

  test("one Back closes what one click opened", async ({ page }) => {
    await openApp(page);
    await addTaskOnBoard(page);
    await openTheTask(page);

    await page.goBack();
    await expect(page.locator(".tm-drawer")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/board");
    expect(new URL(page.url()).search).toBe("");
  });

  test("the copied link is this page, not the Module's", async ({ page }) => {
    await openApp(page);
    await addTaskOnBoard(page);
    await openTheTask(page);

    const href = await page.evaluate(() => {
      const url = new URL(window.location.href);
      return `${url.pathname}${url.search}`;
    });
    // Follow the address the Detail's `링크 복사` now builds — the page the
    // reader is on. It used to hand out `/today?task=…`, which opened the
    // Tasks Module instead of the screen the link was copied from.
    await page.goto(href);
    await expect(page.locator(".ff-matrix-cell-II")).toBeVisible();
    await expect(page.locator(".tm-drawer .tm-drawer-title")).toHaveValue(TASK);
  });

  test("leaving the page leaves the Task behind", async ({ page, viewport }) => {
    // Not on mobile: there the Detail is full screen and §15.13 puts the
    // navigation out of the way rather than dimming it, so there is no Rail to
    // click while a Task is open. Closing it first would leave nothing for
    // this test to prove.
    test.skip((viewport?.width ?? 0) < 768, "a full-screen Detail owns the screen (§15.13)");

    await openApp(page);
    await addTaskOnBoard(page);

    // Back on the Matrix, where this test started. It moved to Focus while the
    // popup was a modal whose scrim covered the Rail; the popup dims nothing
    // now (§3.2), so the Rail is reachable with a Task open and the trip is a
    // trip again — which is also the sharpest way to assert that the scrim is
    // gone.
    await openTheTask(page);

    await page.locator(".global-rail").getByRole("button", { name: "Calendar", exact: true }).click();
    expect(new URL(page.url()).pathname).toBe("/calendar");
    // The Calendar draws a Detail of its own now
    // (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §5) — which makes this
    // assertion sharper, not weaker: a Task open on one page must not follow
    // the reader to the next, even to a page that could have shown it.
    expect(new URL(page.url()).search).toBe("");
    await expect(page.locator(".tm-drawer")).toHaveCount(0);
  });
});
