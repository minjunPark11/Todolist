// The reserved Task Detail column, in a real browser (audit D1-1).
//
// This cannot live in the unit layer for the reason the rest of `e2e/` exists:
// jsdom computes no layout, so `getBoundingClientRect()` returns zeroes and the
// bug being guarded against — a column changing width — is invisible to it.
// The regression it catches shipped and was measured rather than reasoned
// about: with nothing selected the list column was 1136px, and opening a Task
// took it to 672, so every row moved on every click, in a single frame with no
// transition.
//
// The assertion is deliberately about SAMENESS rather than about 672. Pinning
// the number would fail the next time the Detail column's width is tuned, and
// would still pass if both numbers changed together — which is the one thing
// that must not happen.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const LIST = { id: "list-audit", name: "Audit" };

/** The list column's width as the layout is actually using it. */
async function listWidth(page: Page): Promise<number> {
  const box = await page.locator(".tm-list").boundingBox();
  return Math.round(box?.width ?? 0);
}

async function addTask(page: Page, title: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
}

test.describe("the Task Detail column", () => {
  // Only the wide-desktop presentation reserves a column at all. Below 1280
  // the Detail is an overlay, a sheet or the whole screen (§15.17), and there
  // is no track for it to hold open.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "inline column only above 1280 (§15.17)");

  test("is reserved before anything is selected", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);

    const empty = page.locator(".tm-drawer.is-empty");
    await expect(empty).toBeVisible();

    // The empty column is the same width as a filled one — that is the whole
    // point of reserving it, so a narrower placeholder would defeat it.
    const box = await empty.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(400);
  });

  test("opening a Task does not resize the list", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Measure the rail width");

    const before = await listWidth(page);

    await page.getByRole("button", { name: "Open Measure the rail width" }).click();
    await expect(page.locator(".tm-drawer.is-empty")).toHaveCount(0);
    await expect(page).toHaveURL(/\?task=/);

    const after = await listWidth(page);

    // Not `toBeCloseTo`: a scrollbar appearing would be a real regression in
    // this layout, not noise to tolerate.
    expect({ before, after }).toEqual({ before, after: before });
  });

  test("Escape closes the Detail and the list still does not move", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Check hover and focus states");

    const before = await listWidth(page);

    await page.getByRole("button", { name: "Open Check hover and focus states" }).click();
    await expect(page).toHaveURL(/\?task=/);

    await page.keyboard.press("Escape");

    // Escape owns the surface AND the address — leaving `?task=` behind is how
    // a reload would reopen something the user just dismissed.
    await expect(page).not.toHaveURL(/\?task=/);
    await expect(page.locator(".tm-drawer.is-empty")).toBeVisible();
    expect(await listWidth(page)).toBe(before);
  });
});
