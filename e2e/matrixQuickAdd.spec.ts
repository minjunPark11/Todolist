// Adding into a box of the matrix, in a real browser
// (TICKTICK_MATRIX_DESIGN.md §13 Phase 4).
//
// The jsdom tests already prove the input opens where the `+` is and that the
// component hands `priority` up. What they cannot prove is the round trip: a
// title typed into Ⅱ, through the real create path, into real storage, and
// back onto the screen inside the box it was typed into. The whole claim of
// the screen is that the box IS the judgement (D1) — so what is worth watching
// a browser do is the record coming back saying so, with no follow-up edit.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

async function storedTask(page: Page, title: string) {
  return page.evaluate(
    ([key, wanted]) => {
      const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      const task = (data.tasks ?? []).find((row: Record<string, unknown>) => row.title === wanted);
      return task ? { priority: String(task.priority), dueDate: String(task.dueDate ?? "") } : null;
    },
    [STORAGE_KEY, title] as const,
  );
}

test.describe("the matrix's + ", () => {
  test("a task typed into a box is born in that box", async ({ page }) => {
    await openApp(page);
    await page.goto("/board");

    const schedule = page.locator(".ff-matrix-cell-II");
    await expect(schedule).toBeVisible();

    await schedule.getByRole("button", { name: "Add a task to Schedule" }).click();
    const field = schedule.getByRole("textbox", { name: "What belongs in this box?" });
    await field.fill("Write the plan");
    await field.press("Enter");

    await expect(schedule).toContainText("Write the plan");
    // In THAT box and no other — the four are one grid, so a card landing in
    // the wrong one still looks like a card that arrived.
    await expect(page.locator(".ff-matrix-cell-I")).not.toContainText("Write the plan");

    // The judgement is on the record, and no deadline was invented on the way:
    // that erasure is what D1 exists to make impossible.
    expect(await storedTask(page, "Write the plan")).toEqual({ priority: "medium", dueDate: "" });

    // Still open, still empty — a box is what a head is emptied into.
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("");
  });
});
