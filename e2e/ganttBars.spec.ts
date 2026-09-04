// What a timeline bar is made of (TIMELINE_V2_DESIGN.md §1, §2, §5).
//
// Two claims, and neither can be made below the browser. The first is about a
// custom property: `--bar-color` was read by `12-timeline.css` and set by
// nobody, so every bar in the app was drawn in the fallback accent — a bug
// that is invisible to a renderer with no cascade. The second is about where a
// popover lands, which is layout, and jsdom has none.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const NOW = "2026-08-18T00:00:00.000Z";

const LISTS = [
  { id: "l-paper", name: "Paper", color: "purple" },
  { id: "l-dev", name: "Dev", color: "blue" },
];

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Two Lists of different colours, each with one dated task, on the timeline.
 *
 * `openApp` has no colour in its seed shape — the specs it was written for do
 * not paint anything — so the colours are patched into the stored account the
 * way `ganttCompleted` patches its tasks in.
 */
async function openTimeline(page: Page): Promise<void> {
  await openApp(page, { lists: LISTS.map(({ id, name }) => ({ id, name })) });
  await page.evaluate(
    ([key, now, start, end]) => {
      const store = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      store.lists = store.lists.map((list: { id: string }) => {
        if (list.id === "l-paper") return { ...list, color: "purple" };
        if (list.id === "l-dev") return { ...list, color: "blue" };
        return list;
      });
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
        status: "todo",
        completedAt: "",
        createdAt: now as string,
        updatedAt: now as string,
        deletedAt: "",
        startDate: start as string,
        dueDate: end as string,
      };
      store.tasks = [
        { ...base, id: "t-paper", title: "Chapter three", listId: "l-paper", order: 0 },
        { ...base, id: "t-dev", title: "Colour the bars", listId: "l-dev", order: 1 },
      ];
      window.localStorage.setItem(key as string, JSON.stringify(store));
    },
    [STORAGE_KEY, NOW, dayOffset(-1), dayOffset(4)] as const,
  );
  await page.goto("/upcoming?view=gantt");
  await expect(page.locator(".ff-timeline")).toBeVisible();
  // A week, not the default month. The bar's own text is what carries the
  // click that matters here, and below 80px the container query takes it away
  // (§11) — at month zoom a six-day task is 40px of a five-column grid.
  await page.locator(".ff-board-control select").selectOption("week");
}

function row(page: Page, title: string) {
  return page.locator(".ff-timeline-row", { hasText: title });
}

test.describe("a timeline bar", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "the timeline wants a desktop window");

  test("is its List's colour, and two Lists are two colours", async ({ page }) => {
    await openTimeline(page);

    const paper = row(page, "Chapter three").locator(".ff-timeline-bar");
    const dev = row(page, "Colour the bars").locator(".ff-timeline-bar");
    const fillOf = (bar: ReturnType<typeof row>) =>
      bar.evaluate((node) => window.getComputedStyle(node).backgroundColor);

    const [purple, blue] = [await fillOf(paper), await fillOf(dev)];
    // The regression: both of these were `rgb(0, 122, 255)` — the accent the
    // stylesheet falls back to when nothing sets `--bar-color`.
    expect(purple).not.toBe(blue);

    // And the tint is what is painted, not the preset: a bar filled with
    // `#8e4ec6` under `#111` text would be the calendar's arrangement, which
    // §5 decided against for this screen.
    expect(purple).not.toBe("rgb(142, 78, 198)");
    expect(blue).not.toBe("rgb(10, 132, 255)");
  });

  test("has its List's colour at full strength beside the name (I6)", async ({ page }) => {
    await openTimeline(page);

    const dot = row(page, "Chapter three").locator(".ff-timeline-dot");
    await expect(dot).toHaveCSS("background-color", "rgb(142, 78, 198)");
  });

  test("carries dark text, at the contrast the tint was chosen for", async ({ page }) => {
    await openTimeline(page);

    const bar = row(page, "Colour the bars").locator(".ff-timeline-bar");
    // `tintForDarkInk` measures its guarantee against exactly this ink; the
    // unit tests own the ratio, and this owns the pairing being real.
    await expect(bar).toHaveCSS("color", "rgb(17, 17, 17)");
  });
});

// §2. The Board's argument, applied to a screen where it is stronger: D3/D11
// fixed the column count and refused horizontal scrolling, so a column given
// to the Detail is not a narrower grid, it is fewer days.
test.describe("opening a task from the timeline", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "the timeline wants a desktop window");

  test("is a popup, and the grid keeps every day it had", async ({ page }) => {
    await openTimeline(page);

    const timeline = page.locator(".ff-timeline");
    const before = Math.round((await timeline.boundingBox())?.width ?? 0);

    await row(page, "Colour the bars").locator(".ff-timeline-bar-text").click();
    await expect(page).toHaveURL(/task=/);
    await expect(page.locator(".tm-drawer.is-anchored-popover")).toBeVisible();
    await expect(page.locator(".tm-drawer.is-empty")).toHaveCount(0);

    const after = Math.round((await timeline.boundingBox())?.width ?? 0);
    expect({ before, after }).toEqual({ before, after: before });
  });

  test("opens beside the bar that was clicked, not in one fixed place", async ({ page }) => {
    await openTimeline(page);
    const popover = page.locator(".tm-drawer.is-anchored-popover");

    async function openFrom(title: string): Promise<number> {
      await row(page, title).locator(".ff-timeline-bar-text").click();
      await expect(popover).toBeVisible();
      const box = await popover.boundingBox();
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
      return Math.round(box?.y ?? 0);
    }

    // Two rows, two anchors. Asserting a distance from the bar would be
    // asserting the floating layer's flip rules; asserting that the two
    // differ is asserting the one thing this wiring adds — that the rect
    // travelled at all.
    const first = await openFrom("Chapter three");
    const second = await openFrom("Colour the bars");
    expect(first).not.toBe(second);
  });
});

// §6, I3: today is marked three ways, and only one of them needs a browser —
// the line is placed from the clock at render, and where it lands is layout.
test.describe("the mark for today", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "the timeline wants a desktop window");

  test("is a line inside today's own column", async ({ page }) => {
    await openTimeline(page);
    await page.locator(".ff-board-control select").selectOption("week");

    const line = page.locator(".ff-timeline-now-line");
    await expect(line).toBeVisible();

    // The pill and the band say WHICH column; this says where in it. The two
    // must agree, and a line that drifted out of the marked column would mean
    // `windowFraction` and `columnOf` had come apart. The HEADING's cell, of
    // which there is one — the band is drawn per row, so those come one per
    // task and any of them would do.

    const column = page.locator(".ff-timeline-col.is-today");
    await expect(column).toHaveCount(1);

    const lineBox = await line.boundingBox();
    const columnBox = await column.boundingBox();
    expect(lineBox && columnBox).toBeTruthy();
    const x = (lineBox?.x ?? 0) + (lineBox?.width ?? 0) / 2;
    expect(x).toBeGreaterThanOrEqual(columnBox?.x ?? 0);
    expect(x).toBeLessThanOrEqual((columnBox?.x ?? 0) + (columnBox?.width ?? 0));
  });

  test("names the day in the heading, in a pill", async ({ page }) => {
    await openTimeline(page);
    await page.locator(".ff-board-control select").selectOption("week");

    const head = page.locator(".ff-timeline-col.is-today .ff-timeline-col-mark");
    await expect(head).toHaveCount(1);
    // A weekday in the label is I7; a filled pill around it is §6.
    await expect(head).toHaveText(/\(\w+\)$/);
    await expect(head).toHaveCSS("border-radius", "999px");
  });
});
