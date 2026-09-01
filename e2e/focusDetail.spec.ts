// A task clicked on the Focus page opens the Detail
// (TASK_DETAIL_PANEL_MERGE_DESIGN.md §6.9).
//
// Focus handed `selectTask` to every row in its queue and drew nothing with
// the selection, so the click set state no one read — a dead click that
// predates the panel merge and survived it. What makes this an E2E rather
// than a jsdom test is that the bug was never in the component: `FocusPage`
// called its prop correctly the whole time. It was in which page renders the
// pane, which only the assembled app can answer.
//
// It runs at all three viewports on purpose. Below 1280 the Detail is an
// overlay, a sheet or the whole screen (§15.17), and the claim being made is
// that the click opens SOMETHING at every width — not that a column appears,
// which at two of these three would be the wrong shape.
import { expect, test } from "@playwright/test";
import { openApp } from "./addList.helpers";

const TASK = "Write the plan";

test.describe("the Focus page's queue", () => {
  test("clicking a task opens it", async ({ page }) => {
    await openApp(page);

    // Born in the matrix because that path is already proven by
    // `matrixQuickAdd.spec.ts` and leaves no deadline behind. With no dates
    // and no tags the task lands in Focus's catch-all group.
    await page.goto("/board");
    const schedule = page.locator(".ff-matrix-cell-II");
    await schedule.getByRole("button", { name: "Add a task to Schedule" }).click();
    const field = schedule.getByRole("textbox", { name: "What belongs in this box?" });
    await field.fill(TASK);
    await field.press("Enter");
    await expect(schedule).toContainText(TASK);

    await page.goto("/focus");
    const row = page.locator(".foc-task-main", { hasText: TASK });
    await expect(row).toBeVisible();

    // Nothing is open until the click — otherwise a Detail left over from the
    // Matrix would make this pass without Focus doing anything.
    await expect(page.locator(".tm-drawer")).toHaveCount(0);

    await row.click();

    const drawer = page.locator(".tm-drawer");
    await expect(drawer).toBeVisible();
    // `toHaveValue`, not `toHaveText`: the title is still an `<input>`
    // (TICKTICK_DETAIL_ANATOMY_DESIGN.md §3), so its text content is empty.
    await expect(drawer.locator(".tm-drawer-title")).toHaveValue(TASK);
  });

  test("closing it gives the page its width back", async ({ page, viewport }) => {
    // Only the wide-desktop presentation takes a track from the page; the
    // other three cover it and leave the grid alone (§15.17), so there is no
    // width to give back.
    test.skip((viewport?.width ?? 0) < 1280, "inline column only above 1280 (§15.17)");

    await openApp(page);
    await page.goto("/board");
    const schedule = page.locator(".ff-matrix-cell-II");
    await schedule.getByRole("button", { name: "Add a task to Schedule" }).click();
    const field = schedule.getByRole("textbox", { name: "What belongs in this box?" });
    await field.fill(TASK);
    await field.press("Enter");
    await expect(schedule).toContainText(TASK);

    await page.goto("/focus");
    const focusPage = page.locator(".foc-page");
    const before = (await focusPage.boundingBox())?.width ?? 0;
    expect(before).toBeGreaterThan(0);

    await page.locator(".foc-task-main", { hasText: TASK }).click();
    await expect(page.locator(".tm-drawer")).toBeVisible();
    // The page really did yield a column — if it had not, the two widths would
    // be equal and the assertion below would pass for the wrong reason.
    expect((await focusPage.boundingBox())?.width ?? 0).toBeLessThan(before);

    await page.locator(".tm-drawer-close").click();
    await expect(page.locator(".tm-drawer")).toHaveCount(0);
    // Back to exactly what it was, not merely wider. `no-detail` caps the grid
    // at 980px and Focus overrides that cap (`.foc-grid`); a missing override
    // would land somewhere between the two numbers and still look fine.
    expect((await focusPage.boundingBox())?.width ?? 0).toBe(before);
  });
});
