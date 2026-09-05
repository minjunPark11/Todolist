// A track as wide as its days (GANTT_TIMELINE_DESIGN §17).
//
// None of this can be asserted below the browser. jsdom lays nothing out, so
// "the pane is 842px and the track inside it is 1460" has no meaning there —
// the unit tests own the arithmetic that produces those numbers and this owns
// the arrangement actually holding: that the pane clamps, that the names stay
// put when the days slide past them, and that the column headings stay put
// when the rows do.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const NOW = "2026-08-18T00:00:00.000Z";

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Enough rows that the grid is taller than the pane, and one span long enough
 * to still be a span at the coarsest zoom.
 */
async function openTimeline(page: Page): Promise<void> {
  await openApp(page, { lists: [{ id: "l-work", name: "Work" }] });
  await page.evaluate(
    ([key, now, spanStart, spanEnd]) => {
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
        status: "todo",
        completedAt: "",
        createdAt: now as string,
        updatedAt: now as string,
        deletedAt: "",
        startDate: "",
        dueDate: "",
      };
      const rows = [
        {
          ...base,
          id: "t-span",
          title: "The long one",
          listId: "l-work",
          order: 0,
          startDate: spanStart as string,
          dueDate: spanEnd as string,
        },
      ];
      // Thirty single-date rows, a week apart, so the grid overflows its pane
      // downwards as well as sideways.
      for (let i = 0; i < 30; i += 1) {
        const date = new Date();
        date.setDate(date.getDate() + i * 7);
        const pad = (n: number) => String(n).padStart(2, "0");
        rows.push({
          ...base,
          id: `t-${i}`,
          title: `Row ${i + 1}`,
          listId: "l-work",
          order: i + 1,
          dueDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        });
      }
      store.tasks = rows;
      window.localStorage.setItem(key as string, JSON.stringify(store));
    },
    [STORAGE_KEY, NOW, dayOffset(0), dayOffset(40)] as const,
  );
  // The List rather than `/upcoming`: this spec needs rows spread over a
  // year, and a scope defined by the next few days would leave all but the
  // first two off the grid.
  await page.goto("/list/l-work?view=gantt");
  await expect(page.locator(".ff-timeline")).toBeVisible();
}

const scroll = (page: Page) => page.locator(".ff-timeline-scroll");
const zoomTo = (page: Page, value: string) =>
  page.locator(".ff-board-control select").selectOption(value);

async function metrics(page: Page) {
  return scroll(page).evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    scrollLeft: node.scrollLeft,
  }));
}

test.describe("a track as wide as its days", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "the timeline wants a desktop window");

  // The floor is a floor: a window that fits still fills, and only the two
  // that cannot fit go over. This is the half of §17 that promises the default
  // screen did not move.
  test("fills at the short zooms and overflows at the long ones", async ({ page }) => {
    await openTimeline(page);

    for (const zoom of ["day", "week", "month"]) {
      await zoomTo(page, zoom);
      const { scrollWidth, clientWidth } = await metrics(page);
      expect(scrollWidth, `${zoom} should not scroll`).toBe(clientWidth);
    }

    await zoomTo(page, "halfYear");
    const half = await metrics(page);
    expect(half.scrollWidth).toBeGreaterThan(half.clientWidth);

    await zoomTo(page, "year");
    const year = await metrics(page);
    // A year is twice the window of six months at half the scale, so the two
    // tracks are close in length — the coarser zoom buys time, not distance.
    expect(year.scrollWidth).toBeGreaterThan(year.clientWidth);
    expect(year.scrollWidth).toBeGreaterThan(half.scrollWidth);
  });

  // The inversion §17 was written to end: a task with a length has to be drawn
  // longer than a task with none. It was not — 13.5px against 19.8 [실측].
  test("draws a span wider than a single date, at the longest zoom", async ({ page }) => {
    await openTimeline(page);
    await zoomTo(page, "year");

    // By key rather than by title: `Row 1` is a prefix of `Row 10`.
    const width = (key: string) =>
      page
        .locator(`[data-bar-key="task:${key}"]`)
        .evaluate((node) => node.getBoundingClientRect().width);

    expect(await width("t-span")).toBeGreaterThan(await width("t-0"));
  });

  // The one thing a Gantt is for. A name a screen and a half from its bar is
  // not joined to it.
  test("keeps the names in place while the days slide past", async ({ page }) => {
    await openTimeline(page);
    await zoomTo(page, "year");

    const label = page
      .locator(".ff-timeline-row", { has: page.locator('[data-bar-key="task:t-0"]') })
      .locator(".ff-timeline-label");
    const before = await label.evaluate((node) => node.getBoundingClientRect().left);

    await scroll(page).evaluate((node) => {
      node.scrollLeft = 400;
    });
    await expect.poll(async () => (await metrics(page)).scrollLeft).toBeGreaterThan(0);

    expect(await label.evaluate((node) => node.getBoundingClientRect().left)).toBeCloseTo(before, 0);
  });

  // §17.7: making the scrollport moved the heading's sticky anchor onto it, so
  // the pane had to gain a height of its own. Without that the heading would
  // ride up with the rows.
  test("keeps the column headings in place while the rows scroll", async ({ page }) => {
    await openTimeline(page);
    await zoomTo(page, "year");

    const head = page.locator(".ff-timeline-head");
    const before = await head.evaluate((node) => node.getBoundingClientRect().top);

    await scroll(page).evaluate((node) => {
      node.scrollTop = 200;
    });
    await expect
      .poll(async () => scroll(page).evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);

    expect(await head.evaluate((node) => node.getBoundingClientRect().top)).toBeCloseTo(before, 0);
  });

  // The app hides every native scrollbar, so this is the only thing that says
  // how far along a two-screen track you are. §4.1's rule is kept: scrolling
  // shows it, nothing else does.
  test("reports the position with the app's own thumb, lying down", async ({ page }) => {
    await openTimeline(page);
    await zoomTo(page, "year");

    const thumb = page.locator(".overlay-scrollbar.is-horizontal");
    await scroll(page).evaluate((node) => {
      node.scrollLeft = 300;
    });
    await expect(thumb).toHaveClass(/is-visible/);
    await expect(thumb).toHaveCSS("height", "6px");
  });

  // §17.9: it re-anchors the window AND scrolls to the moment, which is why it
  // is no longer switched off inside the window it returns to.
  test("Today brings the moment back onto the screen", async ({ page }) => {
    await openTimeline(page);
    await zoomTo(page, "year");

    // Scoped to the timeline: the quick-add above it carries a date button
    // whose accessible name is the same word.
    const today = page
      .locator(".ff-timeline-nav")
      .getByRole("button", { name: /^(Today|오늘)$/ });
    await expect(today).toBeEnabled();

    await scroll(page).evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await expect.poll(async () => (await metrics(page)).scrollLeft).toBeGreaterThan(0);

    await today.click();
    // The window opens on this month, so the moment is near its left edge and
    // a third of a pane in front of it clamps the scroll back to zero.
    await expect.poll(async () => (await metrics(page)).scrollLeft).toBe(0);
  });
});
