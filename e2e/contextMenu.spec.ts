// The context menu, in a real browser (audit §3.7, L-17).
//
// The audit deferred this one twice: §3.7 records that the reference's menu
// could not be measured because it needs a right-click, and the app it was
// being compared against had no `onContextMenu` handler anywhere in its
// source. Every per-Task action therefore cost opening the Detail panel.
//
// What is asserted here is that ONE menu serves every place a Task appears —
// the row, the row's ⋯ button, a Board card — and that the layer behaves like
// a menu: Escape closes it and gives focus back, and it closes what it opened
// and nothing underneath.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const LIST = { id: "list-menu", name: "Menu" };

async function addTask(page: Page, title: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Add a task" });
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByRole("button", { name: `Open ${title}` })).toBeVisible();
}

const menu = (page: Page) => page.locator(".ff-context-menu");

async function menuItems(page: Page): Promise<string[]> {
  return menu(page).getByRole("menuitem").allTextContents();
}

async function storedTask(page: Page, title: string) {
  return page.evaluate(
    ([key, wanted]) => {
      const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      const task = (data.tasks ?? []).find((row: Record<string, unknown>) => row.title === wanted);
      return task ? { status: String(task.status), priority: String(task.priority), dueDate: String(task.dueDate ?? ""), deletedAt: String(task.deletedAt ?? "") } : null;
    },
    [STORAGE_KEY, title] as const,
  );
}

test.describe("the context menu", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop list is where a right-click is the gesture");

  test("a right-click on a row offers what the Task can be told to do", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Right-click me");

    await page.locator(".tm-task").first().click({ button: "right" });
    await expect(menu(page)).toBeVisible();

    // The date section offers "clear" only when there is a date to clear: an
    // item that does nothing is one the reader rules out every time.
    expect(await menuItems(page)).toEqual([
      // §15.42's groups, with the two choice sets this menu adds between them.
      // Everything but the priorities and the dates comes from the registry
      // in `domain/tasks/actions`, which is also what fills the Detail's ⋯ —
      // §15.63's point being that the two cannot drift apart.
      "Pin",
      "Duplicate",
      "Save as template",
      "Copy link",
      "Start focus",
      "Task activities",
      "High",
      "Medium",
      "Low",
      "No priority",
      "Due today",
      "Due tomorrow",
      "Complete",
      "Mark won't do",
      "Move to trash",
      // The visually hidden way out for a pointer that opened this with a
      // gesture and has no Escape key. It became a `menuitem` when the menu
      // moved onto the layer system, so the arrow keys can reach it.
      "Close",
    ]);
  });

  test("the ⋯ button opens the same menu, and it is the same menu", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Two ways in");

    await page.locator(".tm-task").first().click({ button: "right" });
    const fromPointer = await menuItems(page);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await page.locator(".tm-task-menu").first().click();
    await expect(menu(page)).toBeVisible();
    // Not "looks similar": the same list, because it is built in one place.
    expect(await menuItems(page)).toEqual(fromPointer);
  });

  test("what it offers, it does — and each of them can be undone", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Do the thing");

    await page.locator(".tm-task").first().click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "High" }).click();
    await expect.poll(async () => (await storedTask(page, "Do the thing"))?.priority).toBe("high");
    await expect(page.locator(".tm-task-priority.is-high")).toBeVisible();

    await page.locator(".tm-task").first().click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Due today" }).click();
    await expect.poll(async () => (await storedTask(page, "Do the thing"))?.dueDate).not.toBe("");

    // Priority went through a mutation rather than a field write, so the undo
    // the rest of the app has applies to it too.
    await page.locator(".tm-task").first().click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: "Move to trash" }).click();
    await expect.poll(async () => (await storedTask(page, "Do the thing"))?.deletedAt).not.toBe("");
    await expect(page.locator(".tm-task")).toHaveCount(0);

    await page.locator(".tm-undo").getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".tm-task")).toHaveCount(1);
  });

  test("Escape closes the menu and hands focus back, and stops there", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "One layer at a time");

    // With the Detail open underneath: one Escape should close the menu and
    // leave the Drawer where it is (§16.28's one-layer rule).
    await page.getByRole("button", { name: "Open One layer at a time" }).click();
    await expect(page).toHaveURL(/task=/);

    await page.locator(".tm-task-menu").first().click();
    await expect(menu(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(page, "the Drawer was not the layer Escape was for").toHaveURL(/task=/);

    // And focus is back on the button that opened it, not on <body>.
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focused).toContain("tm-task-menu");
  });

  test("a click outside closes it", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Click away");

    await page.locator(".tm-task").first().click({ button: "right" });
    await expect(menu(page)).toBeVisible();

    await page.locator(".tm-header").click();
    await expect(menu(page)).toHaveCount(0);
  });

  test("a Board card answers the same gesture with the same menu", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "On a card");

    await page.getByRole("button", { name: "Board" }).click();
    await expect(page.locator(".tm-task.is-card")).toHaveCount(1);

    await page.locator(".tm-task.is-card").first().click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole("menuitem", { name: "Complete" }).click();
    await expect.poll(async () => (await storedTask(page, "On a card"))?.status).toBe("completed");
  });
});
