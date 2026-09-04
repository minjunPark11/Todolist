// The shape of the calendar screen (CALENDAR_LAYOUT_V4_DESIGN.md §8).
//
// Layout claims, so they belong to a browser: what is on the row, what is not
// on the screen at all, and how far down the grid starts. The last one is the
// point of the change — the range had a line of its own and the grid began
// below it.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const NOW = "2026-08-18T00:00:00.000Z";

function todayValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * One scheduled task and one without a time.
 *
 * The untimed one is what the removed panel used to list. It is still seeded
 * because it must still be DRAWN — a dated task with no time is an all-day
 * chip, and removing the panel had no business changing that.
 */
async function openCalendar(page: Page): Promise<void> {
  await openApp(page);
  const day = todayValue();
  await page.evaluate(
    ([key, date, now]) => {
      const store = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      const base = {
        description: "",
        priority: "none",
        startDate: date as string,
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
        completedAt: "",
        createdAt: now as string,
        updatedAt: now as string,
        deletedAt: "",
        status: "todo",
      };
      store.tasks = [
        { ...base, id: "t-timed", title: "Product review", dueDate: date, startTime: "10:00", endTime: "11:00", order: 0 },
        { ...base, id: "t-untimed", title: "Unscheduled thing", dueDate: date, startTime: "", endTime: "", order: 1 },
      ];
      window.localStorage.setItem(key as string, JSON.stringify(store));
    },
    [STORAGE_KEY, day, NOW] as const,
  );
  await page.goto("/calendar");
  await expect(page.locator(".gcal-toolbar")).toBeVisible();
}

test.describe("the calendar's shape", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("has no right-hand panel, in either state", async ({ page }) => {
    await openCalendar(page);
    // H1-A: the Eisenhower panel is gone, and so is its collapsed rail — the
    // rail was how it stayed on screen while "closed".
    await expect(page.locator(".gcal-taskpanel")).toHaveCount(0);
    await expect(page.locator(".gcal-taskpanel-rail-btn")).toHaveCount(0);
    // The grid keeps the whole width beside the left column now: two children,
    // not three.
    const columns = await page.locator(".gcal-body > *").count();
    expect(columns).toBe(2);
  });

  test("puts the period and the navigation on the toolbar's own row", async ({ page }) => {
    await openCalendar(page);
    // §3: the range moved back into the toolbar, so there is no second row.
    await expect(page.locator(".gcal-title-row")).toHaveCount(0);

    const toolbar = page.locator(".gcal-toolbar");
    const range = toolbar.locator(".gcal-range-label");
    await expect(range).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Week", exact: true })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "View options" })).toBeVisible();
  });

  test("is still the largest glyph on the screen, which is what R2 protected", async ({ page }) => {
    await openCalendar(page);
    const rangeSize = await page
      .locator(".gcal-range-label")
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    // The day numbers are what R2 caught it losing to.
    const daySize = await page
      .locator(".gcal-col-head")
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(rangeSize).toBeGreaterThan(daySize);
  });

  test("starts the grid right under the toolbar", async ({ page }) => {
    await openCalendar(page);
    const toolbar = (await page.locator(".gcal-toolbar").boundingBox())!;
    const grid = (await page.locator(".gcal-timegrid").boundingBox())!;
    // The removed row was ~44px. A gap that large would mean it came back.
    expect(grid.y - (toolbar.y + toolbar.height)).toBeLessThan(40);
  });
});

test.describe("making an event", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("is a named button at the top of the left column", async ({ page }) => {
    await openCalendar(page);
    // §4: it was a `+` in the toolbar whose name lived only in a tooltip.
    const create = page.locator(".gcal-create-btn");
    await expect(create).toBeVisible();
    await expect(create).toContainText("New event");
    await create.click();
    await expect(page.locator(".gcal-quick-create-form")).toBeVisible();
  });

  test("survives the column being collapsed", async ({ page }) => {
    await openCalendar(page);
    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(page.locator(".gcal-sidebar.is-rail")).toBeVisible();
    // Create left the toolbar, so the rail has to carry it or it is unreachable.
    await expect(page.locator(".gcal-sidebar.is-rail .gcal-create-icon-btn")).toBeVisible();
  });
});

test.describe("what the removed panel did NOT take with it", () => {
  test("a month chip still drags between days", async ({ page }) => {
    await openCalendar(page);
    await page.getByRole("button", { name: "Month", exact: true }).click();
    const chip = page.locator(".gcal-month-cell .gcal-chip").first();
    await expect(chip).toBeVisible();
    // §1: the month view moves its own chips over the same `text/plain`
    // contract the panel used. Removing the panel must not have taken it.
    await expect(chip).toHaveAttribute("draggable", "true");
  });

  test("a dated task with no time is still an all-day chip", async ({ page }) => {
    await openCalendar(page);
    await expect(page.locator(".gcal-chip").filter({ hasText: "Unscheduled thing" })).toBeVisible();
  });

  test("dragging out a new block on the week grid still works", async ({ page, viewport }) => {
    // Its two neighbours are about the month view and an all-day chip, which
    // both survive a phone; this one drags on the week grid, and below 1024
    // there is no week grid to drag on — the same clause the two describes
    // above carry.
    test.skip((viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");
    await openCalendar(page);
    const column = page.locator(".gcal-time-col").nth(2);
    const box = (await column.boundingBox())!;
    const scroller = (await page.locator(".gcal-time-scroll").boundingBox())!;
    const sticky = await page.locator(".gcal-timegrid-sticky").boundingBox();
    const top = Math.max(box.y, sticky ? sticky.y + sticky.height : scroller.y);
    const x = box.x + box.width / 2;
    const y = top + 24;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 80, { steps: 8 });
    await page.mouse.up();

    // The pointer path never went through the drop handlers that were removed.
    await expect(page.locator(".gcal-draft-block")).toBeVisible();
  });
});
