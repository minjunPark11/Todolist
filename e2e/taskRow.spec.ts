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

    // §3.1: the reference accepts a click anywhere down the row's height while
    // drawing a small box. A box-sized target in a 36px row is the version of
    // this that looks right and misses.
    //
    // The box is `--check-size` now (TICKTICK_COMPONENT_06 §16) — one number for the six sizes the
    // app had — and this reads it rather than repeating it, so tuning the
    // token does not fail a test about the TARGET.
    const geometry = await page.locator(".tm-task").first().evaluate((row) => {
      const label = row.querySelector(".tm-task-check") as HTMLElement;
      const input = row.querySelector(".tm-task-check input") as HTMLElement;
      return {
        // `clientHeight` rather than the border box: the row's 1px rule is a
        // divider between rows, not something the target should cover.
        rowContent: row.clientHeight,
        target: Math.round(label.getBoundingClientRect().height),
        box: Math.round(input.getBoundingClientRect().width),
        token: getComputedStyle(document.documentElement).getPropertyValue("--check-size").trim(),
      };
    });
    expect(geometry.target).toBe(geometry.rowContent);
    expect(geometry.box).toBe(Number.parseInt(geometry.token, 10));
    // Smaller than the 14px title it sits beside, which is the proportion the
    // reference draws and the thing 17px got wrong.
    expect(geometry.box).toBeLessThan(17);
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

    // The row says the level in its checkbox and nowhere else
    // (TASK_ROW_TWO_LINES_DESIGN.md §2) — the flag that used to sit after the
    // title is gone. Until something is set, the box is the plain one.
    await expect(page.locator(".tm-task-priority")).toHaveCount(0);
    await expect(page.locator(".tm-task .tm-check")).toHaveClass(/is-none/);

    await page.getByRole("button", { name: "Open Urgent thing" }).click();
    // Priority is a flag that opens a popover now, not a `<select>` (§8.2,
    // §8.5). The old control could show no flag and could not be undone,
    // which is why it went.
    await page.getByRole("button", { name: "Set priority" }).click();
    await page.getByRole("listbox", { name: "Priority" }).getByRole("option", { name: "High" }).click();

    // Two channels, both on the box: the colour, and the accessible name —
    // which is what a screen reader and a forced-colours display are left with
    // now that the flag has gone.
    const box = page.locator(".tm-task .tm-check");
    await expect(box).toHaveClass(/is-high/);
    await expect(box).toHaveAttribute("aria-label", "Complete Urgent thing (High)");
    await expect(page.locator(".tm-task-priority")).toHaveCount(0);
  });

  // TASK_ROW_TWO_LINES_DESIGN.md §3. `Show details` drew the body's first line
  // under the title — except the row is one flex line that does not wrap, so a
  // body asking for 100% of it left the title at its own basis of 0. The row
  // rendered as a grey body with NO TITLE, and every existing assertion passed:
  // they ask whether the span is in the document, and it was.
  //
  // So this one measures. A title that is in the DOM and 0px wide is the bug.
  test("Show details puts the body under the title, not over it", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}`);
    await addTask(page, "Has a body");

    await page.getByRole("button", { name: "Open Has a body" }).click();
    const body = page.getByRole("textbox", { name: "Description" });
    await body.fill("the first line");
    await body.blur();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "View and options" }).click();
    await page.getByRole("menuitem", { name: "Show details" }).click();

    const title = page.locator(".tm-task-title");
    const line = page.locator(".tm-task-body");
    await expect(line).toHaveText("the first line");

    const titleBox = await title.boundingBox();
    const lineBox = await line.boundingBox();
    expect(titleBox, "the title is still drawn").not.toBeNull();
    expect(titleBox!.width, "the title kept its width").toBeGreaterThan(0);
    // Under it, and starting at the same edge — not beside it, and not
    // indented under the checkbox.
    expect(lineBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height - 1);
    expect(Math.abs(lineBox!.x - titleBox!.x)).toBeLessThan(2);
  });
});

// TASK_ROW_TWO_LINES_DESIGN.md §1. A Folder's screen is divided by its Lists,
// and both the last row of a group and the next group's heading were drawing a
// line — one boundary with two owners, 12px apart.
test.describe("a Folder's groups", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop list is where the groups are drawn");

  test("are divided by one line, not two", async ({ page }) => {
    await openApp(page, {
      folders: [{ id: "folder-1", name: "School" }],
      lists: [
        { id: "list-a", name: "A", sidebarFolderId: "folder-1" },
        { id: "list-b", name: "B", sidebarFolderId: "folder-1" },
      ],
    });
    await page.goto("/folder/folder-1");
    // A Folder with nothing in it draws its empty state instead of its groups,
    // and one task is enough to put every group on screen — a group exists
    // because the List does, not because it has work in it.
    await addTask(page, "Something to hold the screen open");

    const second = page.locator(".tm-listgroup").nth(1);
    await expect(second).toBeVisible();
    // The line that stays is the row's `border-bottom`; the group draws none.
    await expect(second).toHaveCSS("border-top-width", "0px");
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

    const geometry = await page.locator(".tm-task").first().evaluate((row) => {
      const label = row.querySelector(".tm-task-check") as HTMLElement;
      return {
        row: Math.round(row.getBoundingClientRect().height),
        target: Math.round(label.getBoundingClientRect().height),
        // Both dimensions, because the box stopped growing here (TICKTICK_COMPONENT_06 §16): the
        // label takes the width in padding instead, and a 15px-wide target
        // would clear the floor in one direction and miss in the other.
        targetWidth: Math.round(label.getBoundingClientRect().width),
        box: Math.round((label.querySelector("input") as HTMLElement).getBoundingClientRect().width),
        handleShown: getComputedStyle(row.querySelector(".tm-task-handle") as HTMLElement).display !== "none",
      };
    });
    expect(geometry.row).toBeGreaterThanOrEqual(44);
    expect(geometry.target).toBeGreaterThanOrEqual(43);
    expect(geometry.targetWidth).toBeGreaterThanOrEqual(43);
    // The drawing does not grow with the target: a 22px tick beside a 14px
    // title is what read as too big.
    expect(geometry.box).toBeLessThan(17);
    // A handle revealed on hover is useless where there is no hover.
    expect(geometry.handleShown).toBe(false);
  });
});

// CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §3. The popup was a centred modal
// over a scrim for a week; what it is now — a popover beside the row, dimming
// nothing — is a geometry claim, and geometry is what a browser is for.
test.describe("the Task popup", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the popup is a desktop presentation");

  test("opens beside the card it was opened from, and dims nothing", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}?view=board`);
    await addTask(page, "Beside me");

    // The anchor is the row's own button — the element the click landed on,
    // which is inset from the card by its padding (§3.4).
    const opener = page.getByRole("button", { name: "Open Beside me" });
    const openerBox = (await opener.boundingBox())!;
    await opener.click();

    const popup = page.locator(".tm-drawer.is-anchored-popover");
    await expect(popup).toBeVisible();
    const box = (await popup.boundingBox())!;

    // §3.3's measured size, and §3.4's placement: to the right of the card,
    // not over the middle of the screen.
    expect(Math.round(box.width)).toBe(440);
    expect(Math.round(box.height)).toBeLessThanOrEqual(360);
    expect(box.x).toBeGreaterThanOrEqual(openerBox.x + openerBox.width);

    // No scrim: the board behind it is not dimmed, and the ✕ is back because
    // there is no scrim to press instead.
    await expect(page.locator(".tm-drawer-scrim")).toHaveCount(0);
    await expect(popup.locator(".tm-drawer-close")).toBeVisible();
  });

  test("leaves the rest of the page clickable", async ({ page }) => {
    await openApp(page, { lists: [LIST] });
    await page.goto(`/list/${LIST.id}?view=board`);
    await addTask(page, "First");
    await addTask(page, "Second");

    await page.getByRole("button", { name: "Open First" }).click();
    await expect(page.locator(".tm-drawer.is-anchored-popover")).toBeVisible();

    // The modal's scrim ate this click. Straight from one Task to the next is
    // what a popover allows and a modal does not.
    await page.getByRole("button", { name: "Open Second" }).click();
    await expect(page.locator(".tm-drawer .tm-drawer-title")).toHaveValue("Second");
  });
});
