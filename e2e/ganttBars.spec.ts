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

// Today (TIMELINE_REFERENCE_PARITY_DESIGN.md §2.2). Only a browser can say
// this: both marks are placed from the clock at render, and whether they line
// up is layout.
//
// It used to be three marks — a pill round the column's first day, a band down
// that column, and the line. The first two named a COLUMN and had to be
// switched off at four of the five zooms to stop them saying something false.
// The chip replaced them: placed from the same fraction the line is, so it is
// exact everywhere.
test.describe("the mark for today", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "the timeline wants a desktop window");

  test("is a chip in the ruler over a line down the grid", async ({ page }) => {
    await openTimeline(page);
    await page.locator(".ff-board-control select").selectOption("week");

    const line = page.locator(".ff-timeline-now-line");
    const chip = page.locator(".ff-timeline-now-chip");
    await expect(line).toBeVisible();
    await expect(chip).toHaveCount(1);
  });

  // The whole point of replacing the pill. `columnOf` could not answer this at
  // four of five zooms; `windowFraction` answers it at all of them.
  test("is drawn at every zoom", async ({ page }) => {
    await openTimeline(page);
    const select = page.locator(".ff-board-control select");

    for (const zoom of ["day", "week", "month", "halfYear", "year"]) {
      await select.selectOption(zoom);
      await expect(page.locator(".ff-timeline-now-chip"), `missing at ${zoom}`).toHaveCount(1);
    }
  });

  // They are drawn from one fraction, so a drift here means something
  // re-derived it. Centres rather than edges: the chip is centred on the stem
  // and the line is centred on the instant.
  test("puts the chip over the line", async ({ page }) => {
    await openTimeline(page);
    await page.locator(".ff-board-control select").selectOption("week");

    const lineBox = await page.locator(".ff-timeline-now-line").boundingBox();
    const chipBox = await page.locator(".ff-timeline-now-chip").boundingBox();
    expect(lineBox && chipBox).toBeTruthy();

    const lineX = (lineBox?.x ?? 0) + (lineBox?.width ?? 0) / 2;
    const chipX = (chipBox?.x ?? 0) + (chipBox?.width ?? 0) / 2;
    // A pixel of rounding on each side of a 1px stem.
    expect(Math.abs(lineX - chipX)).toBeLessThanOrEqual(2);
  });

  // The two tiers of one ruler, and the rule that joins them. A band edge that
  // missed its rule would mean the strip was sized by column count rather than
  // by time — the bug the reference has and §7.2 refuses.
  test("lands a band edge on the rule it names", async ({ page }) => {
    await openTimeline(page);
    await page.locator(".ff-board-control select").selectOption("month");

    const bands = page.locator(".ff-timeline-band");
    await expect(bands).toHaveCount(2);

    const secondBand = await bands.nth(1).boundingBox();
    const markedColumn = await page.locator(".ff-timeline-col.is-band").first().boundingBox();
    expect(secondBand && markedColumn).toBeTruthy();
    expect(Math.abs((secondBand?.x ?? 0) - (markedColumn?.x ?? 0))).toBeLessThanOrEqual(1);
  });
});
