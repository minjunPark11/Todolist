// Finishing work from the grid, and what the fill says about it
// (CALENDAR_TASK_CHECKBOX_DESIGN.md §1, §4, §5, §6).
//
// Every claim here is the browser's. Three of them are about a pointer landing
// on one element rather than another, one is about a computed contrast ratio,
// and one is about a 24px box holding two things — none of which jsdom can
// answer, because it lays nothing out and paints nothing.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const CATEGORY_KEY = "focusflow.calendarCategories.v1";
const NOW = "2026-08-18T00:00:00.000Z";

/**
 * Four categories, chosen so both inks are exercised.
 *
 * Blue and indigo read with white; green and orange read with black (§3.3).
 * A spec that only seeded blue would pass with the ink hard-coded, which is
 * exactly the bug `readableInkOn` exists to prevent.
 */
const CATEGORIES = [
  { id: "cat-personal-default", name: "Default", color: "#0066cc", ink: "rgb(255, 255, 255)" },
  { id: "cat-indigo", name: "Indigo", color: "#5856d6", ink: "rgb(255, 255, 255)" },
  { id: "cat-green", name: "Green", color: "#34c759", ink: "rgb(17, 17, 17)" },
  { id: "cat-orange", name: "Orange", color: "#ff9500", ink: "rgb(17, 17, 17)" },
];

/** The grid opens on the real today, so the fixtures have to live there. */
function todayValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface Fixture {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  categoryId: string;
  done?: boolean;
}

const FIXTURES: Fixture[] = [
  { id: "t-blue", title: "Marketing plan", startTime: "09:00", endTime: "12:00", categoryId: "cat-personal-default" },
  { id: "t-indigo", title: "Design review", startTime: "13:00", endTime: "14:00", categoryId: "cat-indigo" },
  { id: "t-green", title: "Jogging", startTime: "08:00", endTime: "09:00", categoryId: "cat-green" },
  // 15 minutes, which the grid floors to a 24px block — the tight case §4.1
  // decided to keep the box on.
  { id: "t-tight", title: "Collect a delivery", startTime: "16:15", endTime: "16:30", categoryId: "cat-orange" },
  { id: "t-done", title: "Yoga", startTime: "17:00", endTime: "18:00", categoryId: "cat-indigo", done: true },
];

async function openCalendar(page: Page): Promise<void> {
  await openApp(page);
  const day = todayValue();
  await page.evaluate(
    ([storageKey, categoryKey, date, now, fixtures, categories]) => {
      const store = JSON.parse(window.localStorage.getItem(storageKey as string) ?? "{}");
      store.tasks = (fixtures as Fixture[]).map((fixture, index) => ({
        id: fixture.id,
        title: fixture.title,
        description: "",
        status: fixture.done ? "completed" : "todo",
        priority: "none",
        dueDate: date,
        startDate: date,
        startTime: fixture.startTime,
        endTime: fixture.endTime,
        projectId: "",
        categoryId: fixture.categoryId,
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
        repeatType: "none",
        listId: "",
        order: index,
        completedAt: fixture.done ? (now as string) : "",
        createdAt: now as string,
        updatedAt: now as string,
        deletedAt: "",
      }));
      window.localStorage.setItem(storageKey as string, JSON.stringify(store));
      window.localStorage.setItem(
        categoryKey as string,
        JSON.stringify({
          personal: (categories as typeof CATEGORIES).map((category, order) => ({
            id: category.id,
            name: category.name,
            color: category.color,
            order,
            ...(order === 0 ? { isDefault: true } : {}),
            createdAt: now as string,
            updatedAt: now as string,
          })),
          defaultCategoryId: "cat-personal-default",
          activeCategoryId: "cat-personal-default",
          hiddenCategoryIds: [],
          focusColor: "",
          showCompleted: true,
        }),
      );
    },
    [STORAGE_KEY, CATEGORY_KEY, day, NOW, FIXTURES, CATEGORIES] as const,
  );
  await page.goto("/calendar");
  await expect(page.locator(".gcal-time-block").first()).toBeVisible();
}

function blockFor(page: Page, title: string) {
  return page.locator(".gcal-time-block").filter({ hasText: title }).first();
}

function checkFor(page: Page, title: string) {
  return page.getByLabel(`Mark ${title} complete`, { exact: true });
}

test.describe("finishing a task from the grid", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("the box writes the completion, and opens nothing", async ({ page }) => {
    await openCalendar(page);
    await checkFor(page, "Jogging").click();

    // §6: the block's own click opens the Task Detail. The box stops the event
    // before it gets there, so ticking and opening cannot happen together.
    await expect(page.locator(".tm-drawer.is-anchored-popover")).toHaveCount(0);
    await expect(page.locator(".gcal-popover")).toHaveCount(0);
    await expect(blockFor(page, "Jogging")).toHaveClass(/is-done/);
  });

  test("the box does not start a drag", async ({ page }) => {
    await openCalendar(page);
    const block = blockFor(page, "Jogging");
    const before = (await block.boundingBox())!;

    await checkFor(page, "Jogging").click();

    // §6: `startMove` is bound to the block, so a pointerdown on the box would
    // otherwise be read as the beginning of one — and a click that both ticks
    // and reschedules is a click nobody asked for.
    const after = (await blockFor(page, "Jogging").boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  test("dragging the empty column still makes a draft", async ({ page }) => {
    await openCalendar(page);
    // The regression the box could have caused: `shouldStartTimeSelection`
    // rejects a gesture that starts on an `input`, and the boxes are inputs.
    // The empty grid must still answer a drag.
    const column = page.locator(".gcal-time-col").nth(1);
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

    await expect(page.locator(".gcal-draft-block")).toBeVisible();
  });

  test("a 24px block keeps both the box and the title", async ({ page }) => {
    await openCalendar(page);
    // §4.1-A: 15 minutes floors to the grid's 24px minimum. The alternative
    // was "some events cannot be ticked", a rule with nothing on screen to
    // explain it.
    const block = blockFor(page, "Collect a delivery");
    const height = (await block.boundingBox())!.height;
    expect(Math.round(height)).toBe(24);
    await expect(block.locator(".gcal-check-box")).toBeVisible();
    await expect(block.locator(".gcal-tb-title")).toBeVisible();
    await expect(block.locator(".gcal-tb-title")).toHaveText("Collect a delivery");
  });
});

test.describe("what the grid does with finished work", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("keeps it, ticked and quiet", async ({ page }) => {
    await openCalendar(page);
    // §1: the completed layer shipped OFF and nothing could turn it on, so a
    // finished task simply left its slot empty. This is that reversed.
    const done = blockFor(page, "Yoga");
    await expect(done).toBeVisible();
    await expect(done).toHaveClass(/is-done/);
    await expect(page.getByLabel("Mark Yoga not complete", { exact: true })).toBeChecked();
  });

  test("and the sidebar switch takes it away again", async ({ page }) => {
    await openCalendar(page);
    await page.locator(".gcal-view-row input[type='checkbox']").click();
    await expect(blockFor(page, "Yoga")).toHaveCount(0);
    // The open work is untouched — the switch is about finished work only.
    await expect(blockFor(page, "Jogging")).toBeVisible();
  });
});

test.describe("the fill and the ink", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("work still to do is filled at full strength", async ({ page }) => {
    await openCalendar(page);
    // D3-D: the tint is what says "finished", so the open blocks must not be
    // wearing one. An rgba/color() value would mean the mix survived.
    for (const fixture of FIXTURES.filter((entry) => !entry.done)) {
      const paint = await blockFor(page, fixture.title).evaluate((el) => getComputedStyle(el).backgroundColor);
      const category = CATEGORIES.find((entry) => entry.id === fixture.categoryId)!;
      const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(category.color.slice(index, index + 2), 16));
      expect(paint, fixture.title).toBe(`rgb(${r}, ${g}, ${b})`);
    }
  });

  test("and its title takes the ink that reads on it", async ({ page }) => {
    await openCalendar(page);
    // The wiring `readableInkOn` exists for: white on blue and indigo, black
    // on green and orange. Fixing the ink to white — which is what copying the
    // reference app would have meant — fails the last two (§3.3).
    for (const fixture of FIXTURES.filter((entry) => !entry.done)) {
      const ink = await blockFor(page, fixture.title).evaluate((el) => getComputedStyle(el).color);
      const category = CATEGORIES.find((entry) => entry.id === fixture.categoryId)!;
      expect(ink, fixture.title).toBe(category.ink);
    }
  });

  test("finished work steps back to a tint", async ({ page }) => {
    await openCalendar(page);
    const paint = await blockFor(page, "Yoga").evaluate((el) => getComputedStyle(el).backgroundColor);
    // Not the solid colour: some transparency is the whole statement.
    expect(paint).not.toBe("rgb(88, 86, 214)");
    expect(paint).toMatch(/rgba|color\(/);
  });
});
