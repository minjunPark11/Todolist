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
// A line through a title is a style; `status: "completed"` is what the account
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
      .toBe("completed");

    // And the row leaves the open list — a List does not keep finished Tasks
    // among the work still to do. That is why `check()` is the wrong call
    // here: it waits for a checkbox that is on its way out of the document to
    // report itself checked.
    await expect(page.locator("ul.tm-list").first().locator(".tm-task")).toHaveCount(0);

    // It is not gone from the screen, though, and that is the point of the
    // "완료" group: a row that vanishes on being ticked leaves the reader
    // unable to check it was the right one. It lands below the open work,
    // struck through and greyed, under a header that counts it.
    //
    // Asserted here rather than in jsdom because the row leaves through an
    // exit animation, and an animation needs a browser that paints. jsdom
    // fires no animation frames — and neither does a hidden tab, which is
    // how this looked for a while like a framer-motion deadlock rather than
    // a browser that had simply stopped painting.
    const finished = page.locator(".tm-column-done");
    await expect(finished.locator(".tm-task.is-done")).toHaveCount(1);
    await expect(finished.getByRole("button", { name: /Completed/ })).toContainText("1");

    // L-13's whole point: this cost a panel before. The URL is how the panel
    // announces itself (`?task=`), so an unchanged query means nothing opened.
    expect(new URL(page.url()).search, "completing a Task did not open the Detail").toBe(before);
    await expect(page.locator(".tm-drawer.is-empty")).toBeVisible();
  });

  // The movement itself, which is what the row leaving is FOR.
  //
  // Before this the list jumped: the ticked row left `rows` in one frame and
  // the rows below it closed the gap in the same one, so there was nothing to
  // follow from where the row had been to where its replacement now was. The
  // assertion is that the survivors are transformed at some point after the
  // tick — a row being CARRIED to its new place rather than redrawn there.
  //
  // Sampled across frames rather than at one instant, because a spring has no
  // fixed duration to wait out; and it needs a browser that paints, which is
  // the whole reason it is here and not in jsdom.
  test("the rows below a ticked one are carried up, not redrawn there", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Goes away");
    await addTask(page, "Moves up");

    await page.getByRole("checkbox", { name: "Complete Goes away" }).click();

    const moved = await page.evaluate(async () => {
      const seen: string[] = [];
      const deadline = performance.now() + 400;
      await new Promise<void>((resolve) => {
        const tick = () => {
          const row = document.querySelector("ul.tm-list .tm-task");
          if (row) seen.push(getComputedStyle(row).transform);
          if (performance.now() > deadline) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return seen.some((value) => value !== "none" && value !== "matrix(1, 0, 0, 1, 0, 0)");
    });

    expect(moved, "the surviving row was moved by a transform, not by a reflow").toBe(true);

    // And it ends where it belongs, with nothing left over from the tween.
    const survivor = page.locator("ul.tm-list .tm-task").first();
    await expect(survivor).toContainText("Moves up");
    await expect
      .poll(async () => survivor.evaluate((row) => getComputedStyle(row).transform))
      .toMatch(/^(none|matrix(1, 0, 0, 1, 0, 0))$/);
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
    await expect.poll(async () => (await storedTasks(page))[0]?.status).toBe("completed");

    await page.locator(".tm-undo").getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await storedTasks(page))[0]?.status).not.toBe("completed");

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
    // Priority is a flag that opens a popover now, not a `<select>` (§8.2,
    // §8.5). The old control could show no flag and could not be undone,
    // which is why it went.
    await page.getByRole("button", { name: "Set priority" }).click();
    await page.getByRole("listbox", { name: "Priority" }).getByRole("option", { name: "High" }).click();

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
