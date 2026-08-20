// The Projects home in a real browser (SPACE_REMOVAL_IA D-1, step 1-2).
//
// The screen's own behaviour is jsdom's — `ProjectsHome.test.tsx` asserts what
// each row draws and which handler it calls. What is left for a browser is the
// wiring those spies stand in for: an address that the app answers, a door in
// a sidebar rendered by a different shell, and a create that goes all the way
// through the planner into STORAGE.
//
// The last of those is the one worth the CI time. `onCreate` has to resolve a
// work area the reader cannot see (D-6), and on an account that has none it
// has to WRITE one — a Project pointing at a Space that was never saved is a
// Project the tree cannot draw, and no unit test of the component can catch it
// because the component does not know work areas exist.
import { expect, test, type Page } from "@playwright/test";
import { openApp, readStore } from "./addList.helpers";

/**
 * The home itself, never the whole page.
 *
 * The tree in the sidebar draws a row per Project too, with the same name on
 * it — which is the point of this step and not a collision to work around: an
 * unscoped `getByRole("button", { name: "ABM" })` would pass on the row this
 * screen exists to replace.
 */
function home(page: Page) {
  return page.locator(".pjh");
}

/** The Folders the account holds, as the two fields a spec cares about. */
async function readFolders(page: Page): Promise<Array<{ name: string; projectId: string }>> {
  return page.evaluate((key) => {
    const data = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
    return (data.folders ?? [])
      .filter((folder: { archivedAt?: string }) => !folder.archivedAt)
      .map((folder: { name: string; projectId: string }) => ({ name: folder.name, projectId: folder.projectId }));
  }, "focusflow.appData.v1");
}

/** The stored account, including the two collections the helper's type omits. */
async function readProjects(page: Page): Promise<{
  projects: Array<Record<string, string>>;
  spaces: Array<Record<string, string>>;
}> {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key as string) ?? "{}"),
    "focusflow.appData.v1",
  ) as Promise<{ projects: Array<Record<string, string>>; spaces: Array<Record<string, string>> }>;
}

test.describe("the Projects home", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "the sidebar is a drawer below 1024; navShell holds that case");

  test("the sidebar's door opens it, and the Projects are on it", async ({ page }) => {
    await openApp(page, {
      spaces: [{ id: "sp-1", name: "My Space" }],
      projects: [
        { id: "pj-1", name: "ABM", spaceId: "sp-1" },
        { id: "pj-2", name: "Blog", spaceId: "sp-1" },
      ],
    });

    await page.locator("#context-sidebar").getByRole("button", { name: "Projects", exact: true }).click();

    await expect(page).toHaveURL(/\/projects$/);
    // Not "Pick something on the left" — arriving here IS arriving somewhere.
    await expect(home(page).getByRole("button", { name: "ABM", exact: true })).toBeVisible();
    await expect(home(page).getByRole("button", { name: "Blog", exact: true })).toBeVisible();
  });

  test("the address it used to have still opens it", async ({ page }) => {
    await openApp(page, {
      spaces: [{ id: "sp-1", name: "My Space" }],
      projects: [{ id: "pj-1", name: "ABM", spaceId: "sp-1" }],
    });

    // Bookmarks and history hold `/spaces`. RETIRED_ROUTES is what makes the
    // rename an address catching up with a name rather than a broken link.
    await page.goto("/spaces");
    await expect(home(page).getByRole("button", { name: "ABM", exact: true })).toBeVisible();
  });

  test("a Project made here is filed under a work area that exists", async ({ page }) => {
    // No spaces and no projects: the account a new reader has.
    await openApp(page);
    await page.goto("/projects");

    const field = home(page).getByRole("textbox", { name: "New project name" });
    await field.fill("Thesis");
    await home(page).getByRole("button", { name: "Add", exact: true }).click();

    await expect(home(page).getByRole("button", { name: "Thesis", exact: true })).toBeVisible();

    const stored = await readProjects(page);
    expect(stored.projects.map((project) => project.name)).toEqual(["Thesis"]);
    // D-6: hidden, not gone. The Project belongs to a work area, and that work
    // area is a record — not an id pointing at nothing.
    const areaId = stored.projects[0].spaceId;
    expect(areaId).toBeTruthy();
    expect(stored.spaces.map((space) => space.id)).toContain(areaId);

    // And the Lists the reader already had are untouched by any of it.
    expect((await readStore(page)).lists.some((list) => list.kind === "inbox")).toBe(true);
  });

  /**
   * D-2's completion condition, stated as the thing it has to be true of: a
   * reader who never opens the tree can still make a Folder and rename it.
   *
   * The tree is still on screen — it goes in step 6 — so the assertions read
   * STORAGE rather than the sidebar, which would pass either way.
   */
  test("a Folder is made and renamed from the Project, without the tree", async ({ page }) => {
    await openApp(page, {
      spaces: [{ id: "sp-1", name: "My Space" }],
      projects: [{ id: "pj-1", name: "ABM", spaceId: "sp-1" }],
    });
    await page.goto("/s/sp-1/p/pj-1");

    // On the card that lists what a Folder groups, not in a settings screen.
    await page.getByRole("button", { name: "Folders", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Folders" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("textbox", { name: "New folder name" }).fill("Reading");
    await drawer.getByRole("button", { name: "Add", exact: true }).click();

    const name = drawer.getByRole("textbox", { name: "Folder name", exact: true });
    await expect(name).toHaveValue("Reading");
    expect(await readFolders(page)).toEqual([{ name: "Reading", projectId: "pj-1" }]);

    // The field IS the row: renaming is typing in it and pressing Enter.
    await name.fill("Papers");
    await name.press("Enter");
    expect(await readFolders(page)).toEqual([{ name: "Papers", projectId: "pj-1" }]);
  });

  /**
   * One List, one address — the door that outlived the tree.
   *
   * A List had two: `/list/:id` in the Tasks Module, and `/s/:sp/p/:pj/l/:id`
   * in the Space shell, which drew the same record on a different screen
   * behind a different sidebar. Which one you got depended on which door you
   * came through. The tree was one of those doors and stage 6 removed it; the
   * Project screen's Overview still lists this Project's Lists, so the rule
   * still has something to be true of.
   */
  test("a List on the Project's Overview opens the List, not a second screen of it", async ({ page }) => {
    await openApp(page, {
      spaces: [{ id: "sp-1", name: "My Space" }],
      projects: [{ id: "pj-1", name: "ABM", spaceId: "sp-1" }],
      lists: [
        { id: "l-1", name: "Reading", projectId: "pj-1" },
        { id: "l-2", name: "Writing", projectId: "pj-1" },
      ],
    });
    await page.goto("/s/sp-1/p/pj-1");

    await page.locator(".ovs-row").filter({ hasText: "Reading" }).click();

    await expect(page).toHaveURL(/\/list\/l-1$/);
    // And the Tasks sidebar came with it, which is what makes the Overview row
    // a route into the module rather than a second place to read a List.
    await expect(page.locator(".tm-sidebar")).toBeVisible();
  });

  test("an archived Project is off the working list and restorable from here", async ({ page }) => {
    await openApp(page, {
      spaces: [{ id: "sp-1", name: "My Space" }],
      projects: [
        { id: "pj-1", name: "ABM", spaceId: "sp-1" },
        { id: "pj-2", name: "Old thing", spaceId: "sp-1", archived: true },
      ],
    });
    await page.goto("/projects");

    const archived = home(page).getByRole("region", { name: "Archived" });
    await expect(archived.getByText("Old thing")).toBeVisible();

    await archived.getByRole("button", { name: "Restore" }).click();

    // D-20 put archived Projects with the surface that owns them; restoring
    // one is that surface's job, and STORAGE is where the answer lives.
    await expect(home(page).getByRole("button", { name: "Old thing", exact: true })).toBeVisible();
    const stored = await readProjects(page);
    expect(stored.projects.find((project) => project.name === "Old thing")?.status).toBe("active");
  });
});
