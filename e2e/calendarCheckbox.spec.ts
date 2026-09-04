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
 * Four Lists, chosen so both inks are exercised.
 *
 * A block's colour is its List's now
 * (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §3). Indigo and purple
 * read with white; lime and orange read with black (§3.3). A spec that only
 * seeded dark Lists would pass with the ink hard-coded, which is exactly the
 * bug `readableInkOn` exists to prevent.
 */
const LISTS = [
  // `fill` is what the block is actually painted: the picked colour after
  // `darkenForWhiteInk` (CALENDAR_FILL_READABILITY_DESIGN.md §3). Indigo and
  // purple already cleared white text and come through untouched; lime and
  // orange are the two that move, and are here to prove that they do.
  { id: "list-indigo", name: "Indigo", color: "indigo", fill: "rgb(91, 91, 214)" },
  { id: "list-purple", name: "Purple", color: "purple", fill: "rgb(142, 78, 198)" },
  { id: "list-lime", name: "Lime", color: "lime", fill: "rgb(87, 121, 24)" },
  { id: "list-orange", name: "Orange", color: "orange", fill: "rgb(188, 76, 6)" },
];

const WHITE = "rgb(255, 255, 255)";

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
  listId: string;
  done?: boolean;
}

const FIXTURES: Fixture[] = [
  { id: "t-indigo", title: "Marketing plan", startTime: "09:00", endTime: "12:00", listId: "list-indigo" },
  { id: "t-purple", title: "Design review", startTime: "13:00", endTime: "14:00", listId: "list-purple" },
  { id: "t-lime", title: "Jogging", startTime: "08:00", endTime: "09:00", listId: "list-lime" },
  // 15 minutes, which the grid floors to a 24px block — the tight case §4.1
  // decided to keep the box on.
  { id: "t-tight", title: "Collect a delivery", startTime: "16:15", endTime: "16:30", listId: "list-orange" },
  { id: "t-done", title: "Yoga", startTime: "17:00", endTime: "18:00", listId: "list-purple", done: true },
];

async function openCalendar(page: Page): Promise<void> {
  await openApp(page);
  const day = todayValue();
  await page.evaluate(
    ([storageKey, categoryKey, date, now, fixtures, lists]) => {
      const store = JSON.parse(window.localStorage.getItem(storageKey as string) ?? "{}");
      store.lists = [
        ...(store.lists ?? []),
        ...(lists as typeof LISTS).map((entry, order) => ({
          id: entry.id,
          projectId: "",
          kind: "regular",
          name: entry.name,
          color: entry.color,
          order,
          isDefault: false,
          createdAt: now as string,
          updatedAt: now as string,
        })),
      ];
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
        categoryId: "",
        listId: fixture.listId,
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
        order: index,
        completedAt: fixture.done ? (now as string) : "",
        createdAt: now as string,
        updatedAt: now as string,
        deletedAt: "",
      }));
      window.localStorage.setItem(storageKey as string, JSON.stringify(store));
      window.localStorage.setItem(
        categoryKey as string,
        JSON.stringify({ activeListId: "", hiddenSourceIds: [], focusColor: "", showCompleted: true }),
      );
    },
    [STORAGE_KEY, CATEGORY_KEY, day, NOW, FIXTURES, LISTS] as const,
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

async function openViewOptions(page: Page): Promise<void> {
  await page.getByRole("button", { name: "View options" }).click();
  await expect(page.locator(".gcal-viewopts")).toBeVisible();
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
    // The block's own offset inside the grid, not its position in the
    // viewport: clicking scrolls the target into view, so a viewport
    // measurement would move for a reason that has nothing to do with the
    // claim. `top` and `height` are the time, in pixels.
    const geometry = () =>
      blockFor(page, "Jogging").evaluate((el) => ({
        top: (el as HTMLElement).style.top,
        height: (el as HTMLElement).style.height,
      }));
    const before = await geometry();

    await checkFor(page, "Jogging").click();
    await expect(blockFor(page, "Jogging")).toHaveClass(/is-done/);

    // §6: `startMove` is bound to the block, so a pointerdown on the box would
    // otherwise be read as the beginning of one — and a click that both ticks
    // and reschedules is a click nobody asked for.
    expect(await geometry()).toEqual(before);
    // The stored schedule is the claim underneath the pixels.
    const stored = await page.evaluate((key) => {
      const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      const task = (data.tasks ?? []).find((entry: { id: string }) => entry.id === "t-lime");
      return { startTime: task?.startTime, endTime: task?.endTime };
    }, STORAGE_KEY);
    expect(stored).toEqual({ startTime: "08:00", endTime: "09:00" });
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

  test("and the View Options switch takes it away again", async ({ page }) => {
    await openCalendar(page);
    await openViewOptions(page);
    await page.getByRole("checkbox", { name: "Completed work" }).click();
    await expect(blockFor(page, "Yoga")).toHaveCount(0);
    // The open work is untouched — the switch is about finished work only.
    await expect(blockFor(page, "Jogging")).toBeVisible();
  });
});

// The `⋯` panel (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §6).
//
// Two of these switches were rows in the left column, beside the calendars,
// which put two different questions under the same kind of checkbox: "whose
// calendar is this" and "draw this layer at all".
test.describe("View Options", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("opens from the toolbar and names what it holds", async ({ page }) => {
    await openCalendar(page);
    await openViewOptions(page);
    await expect(page.getByRole("radio", { name: "List" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Priority" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Completed work" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Focus records" })).toBeChecked();
  });

  test("colouring by priority repaints the grid", async ({ page }) => {
    await openCalendar(page);
    // Every fixture is `none`, so the whole grid goes to one neutral — which
    // is the point: the axis changed, and the blocks stopped saying which List
    // they are in.
    const before = await blockFor(page, "Jogging").evaluate((el) => getComputedStyle(el).backgroundColor);
    await openViewOptions(page);
    await page.getByRole("radio", { name: "Priority" }).click();
    // Both values are post-darkening: `#8e8e93` -> `#6e6e73` for the priority
    // neutral, `#99d52a` -> `#577918` for lime.
    await expect
      .poll(() => blockFor(page, "Jogging").evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(110, 110, 115)");
    expect(before).toBe("rgb(87, 121, 24)");
  });

  test("keeps its answers on the account, not the device", async ({ page }) => {
    await openCalendar(page);
    await openViewOptions(page);
    await page.getByRole("radio", { name: "Priority" }).click();
    await page.reload();
    await expect(page.locator(".gcal-time-block").first()).toBeVisible();
    // `appSettings`, where the app already keeps `matrixHideCompleted` and
    // `todayGroupAxis` — not the calendar's own localStorage blob, which does
    // not follow the reader to another device (§6.3).
    const stored = await page.evaluate((key) => {
      const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      return data.appSettings?.calendarViewOptions;
    }, STORAGE_KEY);
    expect(stored).toMatchObject({ colorBy: "priority" });
  });
});

// The left column lists the account's Lists now, and its checkbox filters by
// one (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §4). It used to list a
// taxonomy that existed only on this screen, so hiding a row hid a set of
// tasks the user had no other way to describe.
test.describe("the left column", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the week grid wants a desktop window");

  test("names the account's Lists", async ({ page }) => {
    await openCalendar(page);
    const names = page.locator(".gcal-sidebar-section").first().locator(".gcal-cat-name");
    await expect(names).toHaveText(["Inbox", ...LISTS.map((entry) => entry.name)]);
  });

  test("hides one List's blocks and leaves the rest", async ({ page }) => {
    await openCalendar(page);
    const row = page.locator(".gcal-cat-row").filter({ hasText: "Purple" }).first();
    await row.locator("input[type='checkbox']").click();

    // Both of Purple's, and only those.
    await expect(blockFor(page, "Design review")).toHaveCount(0);
    await expect(blockFor(page, "Yoga")).toHaveCount(0);
    await expect(blockFor(page, "Jogging")).toBeVisible();
    await expect(blockFor(page, "Marketing plan")).toBeVisible();
  });

  test("paints its swatch the colour the blocks are", async ({ page }) => {
    await openCalendar(page);
    const box = page.locator(".gcal-cat-row").filter({ hasText: "Lime" }).first().locator("input");
    const swatch = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
    const block = await blockFor(page, "Jogging").evaluate((el) => getComputedStyle(el).backgroundColor);
    // A row that disagreed with its own blocks would be worse than no row.
    expect(swatch).toBe(block);
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
      const list = LISTS.find((entry) => entry.id === fixture.listId)!;
      expect(paint, fixture.title).toBe(list.fill);
    }
  });

  test("takes white on every block, and is dark enough to carry it", async ({ page }) => {
    await openCalendar(page);
    // The change this replaced: the ink used to be picked per colour, which
    // cleared 4.5:1 and still left a grey block reading as disabled. One ink
    // now, and the colour gives way instead
    // (CALENDAR_FILL_READABILITY_DESIGN.md §2).
    for (const fixture of FIXTURES.filter((entry) => !entry.done)) {
      const measured = await blockFor(page, fixture.title).evaluate((el) => {
        const style = getComputedStyle(el);
        const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const channel = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        const luminance = ([r, g, b]: number[]) =>
          0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        const back = luminance(parse(style.backgroundColor));
        const front = luminance(parse(style.color));
        return {
          ink: style.color,
          ratio: (Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05),
        };
      });
      expect(measured.ink, fixture.title).toBe(WHITE);
      // 5, not 4.5: block text is 11px and the bar leaves nothing spare (§3.1).
      expect(measured.ratio, fixture.title).toBeGreaterThanOrEqual(5);
    }
  });

  test("the unfiled block is dark grey, not the mid grey that started this", async ({ page }) => {
    await openCalendar(page);
    // The screenshot that opened the report: quick-added tasks land in the
    // Inbox, the Inbox is neutral, and `#8e8e93` under black text read as
    // disabled. G3 kept the grey and darkened it.
    await page.evaluate((key) => {
      const store = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      store.tasks = (store.tasks ?? []).map((task: { id: string; listId?: string }) =>
        task.id === "t-lime" ? { ...task, listId: "" } : task,
      );
      window.localStorage.setItem(key as string, JSON.stringify(store));
    }, STORAGE_KEY);
    await page.reload();

    const block = blockFor(page, "Jogging");
    await expect(block).toHaveCSS("background-color", "rgb(110, 110, 115)");
    await expect(block).toHaveCSS("color", WHITE);
  });

  test("finished work steps back to a tint", async ({ page }) => {
    await openCalendar(page);
    const paint = await blockFor(page, "Yoga").evaluate((el) => getComputedStyle(el).backgroundColor);
    // Not the solid colour: some transparency is the whole statement.
    expect(paint).not.toBe("rgb(142, 78, 198)");
    expect(paint).toMatch(/rgba|color\(/);
  });
});
