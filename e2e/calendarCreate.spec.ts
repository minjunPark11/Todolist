// Dragging out a time, and what opens beside it
// (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §1, §2, §5).
//
// All three claims here are the browser's: a colour that reads over a grid, a
// form that fits without scrolling, and what a click on a block opens. jsdom
// computes no layout and paints nothing, so none of them can be asserted
// anywhere else.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/** Drag the third day's column from y+240 to y+320 — an hour or so, mid-morning. */
async function dragOutABlock(page: Page): Promise<void> {
  const column = page.locator(".gcal-time-col").nth(2);
  const box = (await column.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 240;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 8 });
  await page.mouse.up();
}

test.describe("dragging a new task onto the calendar", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("draws the block in a colour, not a hint of one", async ({ page }) => {
    await openApp(page);
    await page.goto("/calendar");
    await dragOutABlock(page);

    const ghost = page.locator(".gcal-draft-block");
    await expect(ghost).toBeVisible();

    const paint = await ghost.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: `${style.borderTopWidth} ${style.borderTopStyle}` };
    });
    // §1: 22% of the accent, and a solid 2px edge. It was a 10% literal behind
    // a dashed line — and the literal did not follow the accent setting, so an
    // orange accent drew an orange border round a blue fill.
    expect(paint.border).toBe("2px solid");
    const alpha = Number.parseFloat(paint.background.match(/[\d.]+\s*\)$/)?.[0].replace(")", "") ?? "1");
    expect(alpha).toBeGreaterThan(0.15);
  });

  test("shows the whole form, buttons and all", async ({ page }) => {
    await openApp(page);
    await page.goto("/calendar");
    await dragOutABlock(page);

    const form = page.locator(".gcal-popover.is-form");
    await expect(form).toBeVisible();
    // §2.1: the shell's 340px cap cut the Confirm button off the bottom, so
    // finishing what you had started meant scrolling a popover to find it.
    await expect(form.getByRole("button", { name: "Create task" })).toBeInViewport();
    const scrolls = await form.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrolls, "the form fits without scrolling").toBe(false);
  });

  test("asks for the due date with the app's own calendar", async ({ page }) => {
    await openApp(page);
    await page.goto("/calendar");
    await dragOutABlock(page);

    // §2.3: it was an `<input type="date">` — the one control on this form that
    // belonged to no screen in this app.
    await expect(page.locator('.gcal-newtask-form input[type="date"]')).toHaveCount(0);
    await page.locator(".gcal-newtask-duebtn").click();

    await expect(page.locator(".sched-cal")).toBeVisible();
    // D1-A: a day, and nothing else. This task's time is the block that was
    // just dragged, and a second answer to it would have no rule saying which
    // one wins.
    for (const row of ["Time", "Reminder", "Repeat"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${row}`) })).toBeDisabled();
    }
  });
});

test.describe("a task already on the calendar", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the popup is a desktop presentation");

  test("opens the app's own Detail, beside the block", async ({ page }) => {
    await openApp(page);
    await page.goto("/calendar");
    await dragOutABlock(page);
    await page.locator(".gcal-newtask-form input").first().fill("Blocked out");
    await page.getByRole("button", { name: "Create task" }).click();

    const block = page.locator(".gcal-time-block").first();
    await expect(block).toBeVisible();
    await block.click();

    // §5: the same Detail as everywhere else, and the address to match. The
    // calendar used to answer this click with a card of its own — a title, a
    // date, and a two-field quick edit.
    await expect(page.locator(".tm-drawer.is-anchored-popover")).toBeVisible();
    await expect(page.locator(".gcal-popover")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("task")).toBeTruthy();
  });
});
