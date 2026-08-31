// The week's screen: what it holds, how it is divided, and what a drag means.
//
// Three changes meet here, and they only make sense together.
//
// §12.6 used to run the Upcoming horizon from today forward and turn overdue
// work away, on the reading that overdue "belongs to Today". That is true of
// where it is ACTED on and false of where it is planned: a week's screen that
// omits the work whose date is already certainly wrong is missing the part
// that most needs deciding. The reference app opens 다음 7일 on a "기한 초과"
// group, and so does this now.
//
// Which is only useful if the screen SAYS which is which — hence the date
// groups, the same division and the same labels the Matrix's boxes and the
// Board's columns have had since their phase 2s.
//
// And once a row is under a heading that names a day, dragging it under
// another one has an obvious meaning: reschedule it. That is the last part,
// and it is why this spec is here rather than in jsdom — a drag needs a
// pointer and real layout to be dragged across.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

/** The app reads the real clock, so the fixture is written against it. */
function isoDay(offset: number): string {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

const SEED = [
  { id: "late", title: "Ran late", dueDate: isoDay(-9) },
  { id: "now", title: "Due today", dueDate: isoDay(0) },
  { id: "next", title: "Due tomorrow", dueDate: isoDay(1) },
  { id: "far", title: "Due later this week", dueDate: isoDay(4) },
];

/** The stored due date of one task, which is what a reschedule has to change. */
async function storedDueDate(page: Page, id: string): Promise<string> {
  return page.evaluate(
    ([key, taskId]) => {
      const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
      const found = (data.tasks ?? []).find((task: Record<string, unknown>) => task.id === taskId);
      return String(found?.dueDate ?? "");
    },
    [STORAGE_KEY, id] as const,
  );
}

const groupNames = (page: Page) => page.locator(".tm-group-name").allTextContents();

test.describe("the week's screen", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the desktop list is where the groups have room");

  test("holds the work that is already late, not only the week ahead", async ({ page }) => {
    await openApp(page, { tasks: SEED });
    await page.goto("/upcoming");

    // All four, and the late one first: it is the only date that is certainly
    // wrong, so it is the one the week has to deal with.
    await expect(page.locator(".tm-task-title")).toHaveText([
      "Ran late",
      "Due today",
      "Due tomorrow",
      "Due later this week",
    ]);
  });

  test("divides them by date, in the order the day depends on them", async ({ page }) => {
    await openApp(page, { tasks: SEED });
    await page.goto("/upcoming");

    await expect.poll(() => groupNames(page)).toEqual(["Overdue", "Today", "Tomorrow", "Later"]);

    // The count is the group's own, not the Scope's.
    await expect(page.locator(".tm-group.is-overdue .tm-group-count")).toHaveText("1");
  });

  test("a row dragged into another group is rescheduled, not re-sorted", async ({ page }) => {
    await openApp(page, { tasks: SEED });
    await page.goto("/upcoming");

    expect(await storedDueDate(page, "late")).toBe(isoDay(-9));

    // Onto the heading, which is the part of a group that names the day.
    await page
      .locator(".tm-group.is-overdue .tm-task")
      .first()
      .dragTo(page.locator(".tm-group.is-tomorrow .tm-group-head"));

    // The write, not the row's new neighbours: a reschedule that only moved
    // the row would be undone by the next render.
    await expect.poll(() => storedDueDate(page, "late")).toBe(isoDay(1));
    await expect(page.locator(".tm-group.is-tomorrow .tm-task-title")).toHaveText([
      "Due tomorrow",
      "Ran late",
    ]);
    // And the group it left is gone, because it held nothing else.
    await expect(page.locator(".tm-group.is-overdue")).toHaveCount(0);
  });

  test("and it comes with the way back", async ({ page }) => {
    await openApp(page, { tasks: SEED });
    await page.goto("/upcoming");

    await page
      .locator(".tm-group.is-overdue .tm-task")
      .first()
      .dragTo(page.locator(".tm-group.is-today .tm-group-head"));
    await expect.poll(() => storedDueDate(page, "late")).toBe(isoDay(0));

    // Every change arrives with the way back — the rule `useTaskCommands` is
    // built around, and a rescheduling drag is a change like any other.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => storedDueDate(page, "late")).toBe(isoDay(-9));
  });

  test("a group that is not a day to move to refuses the row", async ({ page }) => {
    await openApp(page, { tasks: SEED });
    await page.goto("/upcoming");

    // "이후" is four days at once, so committing any one of them would be the
    // app choosing a deadline nobody asked for. Nothing is written and the row
    // stays where it was.
    await page
      .locator(".tm-group.is-today .tm-task")
      .first()
      .dragTo(page.locator(".tm-group.is-later .tm-group-head"));

    await expect(page.locator(".tm-group.is-today .tm-task-title")).toHaveText(["Due today"]);
    expect(await storedDueDate(page, "now")).toBe(isoDay(0));
  });
});
