// What a row can DO, in a real browser (audit L-13, L-17; §3.1).
//
// The fidelity audit measured the reference's row and found two things this
// app did not have, and neither of them is a size: a Task could not be
// completed from the list at all — only from the Detail panel — and a list
// could not be reordered by dragging, though the same Tasks on the Board
// could. This spec is those two behaviours plus the priority flag, which was
// stored on every Task and drawn nowhere.
//
// The assertions go to STORAGE rather than to a class name where they can.
// A line through a title is a style; `status: "done"` is what the account
// holds, and it is what has to survive a reload.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const LIST = { id: "list-rows", name: "Rows" };

async function addTask(page: Page, title: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
}

/** The Tasks the account actually holds, in stored order. */
async function storedTasks(page: Page): Promise<Array<{ title: string; status: string; order: number }>> {
  return page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
    return (data.tasks ?? []).map((task: Record<string, unknown>) => ({
      title: String(task.title),
      status: String(task.status),
      order: Number(task.order ?? 0),
    }));
  }, STORAGE_KEY);
}

test.describe("what a Task row can do", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop list is where the row has room for all of it");

  test("a Task is completed from the row, without opening anything", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Finish from the list");

    const before = new URL(page.url()).search;
    await page.getByRole("checkbox", { name: "Complete Finish from the list" }).click();

    // The write, not the strikethrough.
    await expect
      .poll(async () => (await storedTasks(page)).find((task) => task.title === "Finish from the list")?.status)
      .toBe("done");

    // And the row leaves, because a List does not keep finished Tasks in it.
    // That is why `check()` is the wrong call here: it waits for a checkbox
    // that is on its way out of the document to report itself checked.
    await expect(page.locator(".tm-task")).toHaveCount(0);

    // L-13's whole point: this cost a panel before. The URL is how the panel
    // announces itself (`?task=`), so an unchanged query means nothing opened.
    expect(new URL(page.url()).search, "completing a Task did not open the Detail").toBe(before);
    await expect(page.locator(".tm-drawer.is-empty")).toBeVisible();
  });

  test("the checkbox is the size of the row, not the size of the box", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Aim at me");

    // §3.1: the reference draws 17px and accepts a click anywhere down the
    // row's height. A 17px target in a 36px row is the version of this that
    // looks right and misses.
    const geometry = await page.locator(".tm-task").first().evaluate((row) => {
      const label = row.querySelector(".tm-task-check") as HTMLElement;
      const input = row.querySelector(".tm-task-check input") as HTMLElement;
      return {
        // `clientHeight` rather than the border box: the row's 1px rule is a
        // divider between rows, not something the target should cover.
        rowContent: row.clientHeight,
        target: Math.round(label.getBoundingClientRect().height),
        box: Math.round(input.getBoundingClientRect().width),
      };
    });
    expect(geometry.target).toBe(geometry.rowContent);
    expect(geometry.box).toBe(17);
  });

  test("completing can be undone, and the undo is what the account keeps", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Changed my mind");

    await page.getByRole("checkbox", { name: "Complete Changed my mind" }).click();
    await expect.poll(async () => (await storedTasks(page))[0]?.status).toBe("done");

    await page.locator(".tm-undo").getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await storedTasks(page))[0]?.status).not.toBe("done");

    // The row comes back with it — an undo that restored the record and left
    // the list empty would be worse than none.
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Complete Changed my mind" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Complete Changed my mind" })).not.toBeChecked();
  });

  test("dragging a row reorders the list, and the order is stored", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "First");
    await addTask(page, "Second");
    await addTask(page, "Third");

    const titles = () => page.locator(".tm-task-title").allTextContents();
    expect(await titles()).toEqual(["First", "Second", "Third"]);

    // Onto the row that is where it should end up — the same rule the Board
    // uses, so a card and a row answer a drop the same way.
    await page.locator(".tm-task").nth(2).dragTo(page.locator(".tm-task").nth(0));
    await expect.poll(titles).toEqual(["Third", "First", "Second"]);

    // Stored, not just rendered: the order has to outlive the component.
    await page.reload();
    await expect.poll(titles).toEqual(["Third", "First", "Second"]);
  });

  test("priority is drawn on the row it belongs to", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Urgent thing");

    // Nothing is flagged until something is High: a flag on every row is the
    // same as no flag at all.
    await expect(page.locator(".tm-task-priority")).toHaveCount(0);

    await page.getByRole("button", { name: "Open Urgent thing" }).click();
    await page.locator(".tm-drawer select").first().selectOption("high");

    const flag = page.locator(".tm-task-priority");
    await expect(flag).toHaveCount(1);
    await expect(flag).toHaveClass(/is-high/);
    await expect(flag).toHaveAttribute("aria-label", "High");
  });
});

test.describe("the row under a finger", () => {
  // §15.12: everything above may be tuned down, but nothing a finger has to
  // hit goes under 44. The checkbox is the newest such thing, and it is the
  // one that stretches to the row — so the row is what has to clear the floor.
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "the coarse-pointer project is the phone one");

  test("the checkbox clears the touch floor", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Tap me");

    const geometry = await page.locator(".tm-task").first().evaluate((row) => ({
      row: Math.round(row.getBoundingClientRect().height),
      target: Math.round((row.querySelector(".tm-task-check") as HTMLElement).getBoundingClientRect().height),
      handleShown: getComputedStyle(row.querySelector(".tm-task-handle") as HTMLElement).display !== "none",
    }));
    expect(geometry.row).toBeGreaterThanOrEqual(44);
    expect(geometry.target).toBeGreaterThanOrEqual(43);
    // A handle revealed on hover is useless where there is no hover.
    expect(geometry.handleShown).toBe(false);
  });
});
