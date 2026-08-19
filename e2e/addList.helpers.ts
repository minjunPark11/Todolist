// Shared setup for the Add List E2E specs.
//
// The app is local-first: there is no server to seed, so a run starts by
// writing the account into localStorage before the first paint. That is also
// why the specs can assert against storage directly — what is written there IS
// what the account holds.
import { expect, type Page } from "@playwright/test";

export const STORAGE_KEY = "focusflow.appData.v1";

const NOW = "2026-08-18T00:00:00.000Z";

export interface SeedOptions {
  /** Sidebar groups to start with (Add List calls these Folders — §R.7). */
  folders?: Array<{ id: string; name: string }>;
  lists?: Array<{ id: string; name: string; sidebarFolderId?: string; projectId?: string }>;
  /** The work areas at the top of the Space tree (§51). */
  spaces?: Array<{ id: string; name: string }>;
  /**
   * The level under a Space. `projectId` on a List files it under one of
   * these, which is what puts a row in the tree — the Tasks sidebar reaches
   * the same List without any of this.
   */
  projects?: Array<{ id: string; name: string; spaceId: string }>;
  /**
   * The stored theme. Seeded rather than emulated because the app resolves
   * `system` from `prefers-color-scheme` ONCE, at mount — a spec that flipped
   * the media afterwards would be asserting against the palette it started in.
   */
  theme?: "light" | "dark";
}

/**
 * Puts an account in place and opens the app on it.
 *
 * The write happens in an init script so it lands before the app's first read
 * — seeding after load would race the very state the test is about.
 */
export async function openApp(page: Page, seed: SeedOptions = {}): Promise<void> {
  const data = {
    tasks: [],
    projects: (seed.projects ?? []).map((project, index) => ({
      id: project.id,
      name: project.name,
      description: "",
      color: "#0066cc",
      order: index,
      spaceId: project.spaceId,
      // U2: a Space with one List hides the List level entirely. A spec about
      // clicking a List row needs the row to exist.
      listsRevealed: true,
      createdAt: NOW,
      updatedAt: NOW,
    })),
    subtasks: [],
    focusSessions: [],
    activeSessionId: "",
    learningPaths: [],
    spaces: (seed.spaces ?? []).map((space, index) => ({
      id: space.id,
      name: space.name,
      description: "",
      color: "#0066cc",
      order: index,
      createdAt: NOW,
      updatedAt: NOW,
    })),
    folders: [],
    lists: [
      {
        id: "list-inbox",
        projectId: "",
        spaceId: "",
        kind: "inbox",
        name: "Inbox",
        order: -1,
        isDefault: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      ...(seed.lists ?? []).map((list, index) => ({
        id: list.id,
        projectId: list.projectId ?? "",
        kind: "regular",
        name: list.name,
        order: index,
        isDefault: false,
        createdAt: NOW,
        updatedAt: NOW,
        ...(list.sidebarFolderId ? { sidebarFolderId: list.sidebarFolderId } : {}),
      })),
    ],
    sidebarFolders: (seed.folders ?? []).map((folder, index) => ({
      id: folder.id,
      name: folder.name,
      sortKey: index,
      createdAt: NOW,
      updatedAt: NOW,
    })),
    savedFilters: [],
    listSections: [],
    dailyPlans: [],
    tags: [],
    taskTags: [],
    settings: {},
    appSettings: { language: "en", ...(seed.theme ? { theme: seed.theme } : {}) },
  };

  // Seeded ONCE, not on every navigation. An init script runs before each
  // document, so writing unconditionally would silently restore the starting
  // account on every reload and `goto` — and the specs that reload are exactly
  // the ones asking whether what was created survives.
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, value as string);
      }
    },
    [STORAGE_KEY, JSON.stringify(data)] as const,
  );
  await page.goto("/today");
  // The shell, not the sidebar. Below 1024 the sidebar is a closed drawer, and
  // since P0-11 a closed drawer is genuinely hidden rather than parked
  // off-canvas — waiting for it to be visible would wait for a click nobody
  // has made yet. `.tm-shell` is the module having rendered, in every mode.
  await expect(page.locator(".tm-shell")).toBeVisible();
}

/** The stored account, as the app would read it back. */
export async function readStore(page: Page): Promise<{
  lists: Array<Record<string, string>>;
  sidebarFolders: Array<Record<string, string>>;
}> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key as string) ?? "{}"), STORAGE_KEY);
}

export function dialog(page: Page) {
  return page.locator('[role="dialog"]');
}

export function nameField(page: Page) {
  return page.locator(".tm-modal-input").first();
}

/**
 * Below desktop the sidebar is an off-canvas sheet (§15.14), so the tree has
 * to be brought on screen before anything in it can be reached. A no-op where
 * the sidebar is already a column.
 */
async function revealSidebar(page: Page): Promise<void> {
  const menu = page.locator(".tm-menu-open");
  if ((await menu.count()) > 0 && (await menu.isVisible())) {
    await menu.click();
    await expect(page.locator(".tm-shell")).toHaveClass(/sidebar-open/);
  }
}

/** §1.1: the Lists header's entry. */
export async function openFromHeader(page: Page): Promise<void> {
  await revealSidebar(page);
  // By its own name. `[aria-label]` alone used to be unique here; Manage has
  // one now, so the selector has to say which button it means.
  await page.getByRole("button", { name: "Add list", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

/** §1.2: a group's own entry, which fills the Folder field in. */
export async function openFromFolder(page: Page, folderName: string): Promise<void> {
  await revealSidebar(page);
  await page.getByLabel(`Add list in ${folderName}`).click();
  await expect(dialog(page)).toBeVisible();
}

/** A List named and created the fastest way there is (§0.7 R0-2). */
export async function createListNamed(page: Page, name: string): Promise<void> {
  await nameField(page).fill(name);
  await nameField(page).press("Enter");
  await expect(dialog(page)).toBeHidden();
}
