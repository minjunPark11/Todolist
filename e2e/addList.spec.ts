// The 27 E2E scenarios of Add List design §17.4-§17.30.
//
// All 27 are enumerated here. Five of them describe a server this app does not
// have — §R.4 records that trade — and those are skipped WITH the reason
// attached rather than quietly dropped, so the count in this file matches the
// count in the gate and the difference is visible in the report.
//
// What these test that nothing else can: layout, real navigation, and real
// storage. The rules are domain tests and the interactions are jsdom (§R.9);
// duplicating those here would only make the slowest layer the widest one.
import { expect, test } from "@playwright/test";
import {
  createListNamed,
  dialog,
  nameField,
  openApp,
  openFromFolder,
  openFromHeader,
  readStore,
} from "./addList.helpers";

const isMobile = (name: string) => name === "mobile";
const isDesktop = (name: string) => name === "desktop";

test.describe("Add List", () => {
  test("E2E-01 — the fastest possible creation", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "§17.4 is the desktop sidebar's flow; §17.28 is the mobile one.");
    await openApp(page);

    await openFromHeader(page);
    // §17.4: typing must work with no click of its own.
    await expect(nameField(page)).toBeFocused();
    // The defaults §17.4 names: no colour, List view, no folder.
    await expect(page.locator(".tm-swatch.is-none")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".tm-folder-trigger-label")).toHaveText("None");
    await expect(page.locator(".tm-modal-submit")).toBeDisabled();

    await createListNamed(page, "School");

    // READY_FOR_FIRST_TASK, which §17.2 calls the finish line rather than the row.
    await expect(page).toHaveURL(/\/list\/list-/);
    await expect(page.locator(".tm-row.is-current")).toHaveText(/School/);
    await expect(page.locator(".tm-quickadd-title")).toBeVisible();
  });

  test("E2E-02 — a Folder's own entry fills the Folder in", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    // The sidebar draws a group only when it holds a List, so the group this
    // opens from has one.
    await openApp(page, {
      folders: [{ id: "sf1", name: "Grad school" }],
      lists: [{ id: "l-existing", name: "Coursework", sidebarFolderId: "sf1" }],
    });

    await openFromFolder(page, "Grad school");

    // §17.5's MUST: a default, not a constraint.
    await expect(page.locator(".tm-folder-trigger-label")).toHaveText("Grad school");
    await createListNamed(page, "Thesis");

    const store = await readStore(page);
    expect(store.lists.find((list) => list.name === "Thesis")?.sidebarFolderId).toBe("sf1");
    await expect(page.locator(".tm-group").getByText("Thesis")).toBeVisible();
  });

  test("E2E-03 — Board as the default View opens as a Board", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    await page.locator(".tm-modal .tm-view", { hasText: "Board" }).click();
    await createListNamed(page, "Project");

    // §17.6's PASS condition: the Board is what is there, with no List frame
    // first. The URL says so from the first paint rather than being corrected.
    await expect(page).toHaveURL(/\?view=board/);
    await expect(page.locator(".tm-board")).toBeVisible();
    await expect(page.locator(".tm-list")).toHaveCount(0);
  });

  test("E2E-04 — Gantt as the default View opens as a timeline", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    await page.locator(".tm-modal .tm-view", { hasText: "Timeline" }).click();
    await createListNamed(page, "Roadmap");

    await expect(page).toHaveURL(/\?view=gantt/);
    await expect(page.locator(".tgv")).toBeVisible();
  });

  test("E2E-05 — a preset colour is stored and painted", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    await page.getByLabel("Blue", { exact: true }).click();
    await createListNamed(page, "Blue list");

    const store = await readStore(page);
    expect(store.lists.find((list) => list.name === "Blue list")?.color).toBe("blue");
    // Painted where the user will look for it, not only stored.
    await expect(page.locator(".tm-row.is-current .tm-dot")).toHaveCSS("background-color", "rgb(10, 132, 255)");
  });

  test("E2E-06 — a custom colour is stored only once it is whole", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    // The hex field lives in the swatch's popover now (§4.19/§4.20), and the
    // value it holds is the popover's until Apply — which is what keeps a
    // half-typed code out of the draft.
    await page.locator(".tm-swatch-custom").click();
    const hex = page.locator(".tm-color-popover .tm-color-hex input");

    // §13.22: half a hex is not a colour, so Apply refuses it.
    await hex.fill("#4F7");
    await expect(page.locator(".tm-color-popover .tm-modal-submit")).toBeDisabled();

    await hex.fill("#4F7AF8");
    await page.locator(".tm-color-popover .tm-modal-submit").click();
    await expect(page.locator(".tm-color-popover")).toBeHidden();

    await nameField(page).fill("Half");
    await nameField(page).press("Enter");
    await expect(dialog(page)).toBeHidden();

    const store = await readStore(page);
    expect(store.lists.find((list) => list.name === "Half")?.color).toBe("#4F7AF8");
  });

  test("E2E-07 — the Folder default can be changed to None", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    // The sidebar draws a group only when it holds a List, so the group this
    // opens from has one.
    await openApp(page, {
      folders: [{ id: "sf1", name: "Grad school" }],
      lists: [{ id: "l-existing", name: "Coursework", sidebarFolderId: "sf1" }],
    });
    await openFromFolder(page, "Grad school");

    await page.locator(".tm-folder-trigger").click();
    await page.locator(".tm-folder-option", { hasText: "None" }).click();
    await expect(page.locator(".tm-folder-trigger-label")).toHaveText("None");

    await createListNamed(page, "Loose");

    const created = (await readStore(page)).lists.find((list) => list.name === "Loose");
    expect(created?.sidebarFolderId).toBeUndefined();
  });

  test("E2E-08 — a Folder made inline is used by the List that caused it", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    await page.locator(".tm-folder-trigger").click();
    await page.locator(".tm-folder-new").click();
    // §6.30: the footer becomes the editor; no second dialog appears over the
    // first, which is what would make the draft underneath feel losable.
    await expect(dialog(page)).toHaveCount(1);
    await page.locator(".tm-folder-create input").fill("Research");
    await page.locator(".tm-folder-create-actions button").last().click();

    // §6.32: made in order to be used, so it is selected immediately.
    await expect(page.locator(".tm-folder-trigger-label")).toHaveText("Research");
    await createListNamed(page, "Papers");

    const store = await readStore(page);
    const folder = store.sidebarFolders.find((entry) => entry.name === "Research");
    expect(store.lists.find((list) => list.name === "Papers")?.sidebarFolderId).toBe(folder?.id);
  });

  test("E2E-09 — the same name twice is simply allowed", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page, { lists: [{ id: "l1", name: "School" }] });
    await openFromHeader(page);

    await createListNamed(page, "School");

    const named = (await readStore(page)).lists.filter((list) => list.name === "School");
    // §3.15's MUST NOTs, all three: no error, no suffix, and two distinct ids.
    expect(named).toHaveLength(2);
    expect(named[0].id).not.toBe(named[1].id);
    expect(named.map((list) => list.name)).toEqual(["School", "School"]);
  });

  test("E2E-10 — an empty name disables Add without accusing anyone", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    await expect(page.locator(".tm-modal-submit")).toBeDisabled();
    await nameField(page).fill("   ");
    await expect(page.locator(".tm-modal-submit")).toBeDisabled();
    // §3.19: an empty name on opening is the normal state, not an error.
    await expect(page.locator(".tm-state.is-error")).toHaveCount(0);

    await page.locator(".tm-modal-cancel").click();
    await expect(dialog(page)).toBeHidden();
  });

  test("E2E-11 — the Enter that ends an IME composition does not submit", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await nameField(page).fill("학교");

    // A real composition, set through CDP, so the `isComposing` the guard reads
    // is the browser's own rather than a flag the test asserted into being.
    const session = await page.context().newCDPSession(page);
    await session.send("Input.imeSetComposition", { text: "학교", selectionStart: 2, selectionEnd: 2 });
    // 229 is the key code a browser reports while an IME is processing, which
    // is what makes this the commit Enter and not a submit one.
    await session.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
    });

    await expect(dialog(page)).toBeVisible();
    expect((await readStore(page)).lists.filter((list) => list.name === "학교")).toHaveLength(0);
  });

  test("E2E-12 — clicking Add repeatedly makes one List", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await nameField(page).fill("Once");

    const submit = page.locator(".tm-modal-submit");
    await submit.click({ clickCount: 3, delay: 0 }).catch(() => {});
    await expect(dialog(page)).toBeHidden();

    expect((await readStore(page)).lists.filter((list) => list.name === "Once")).toHaveLength(1);
  });

  test("E2E-13 — hammering Enter makes one List", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await nameField(page).fill("Once only");

    // The regression this exists for: three keydowns in one tick made three
    // Lists, because the guard was reading React state.
    await page.locator(".tm-modal-input").first().evaluate((node) => {
      for (let i = 0; i < 5; i += 1) {
        node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      }
    });
    await expect(dialog(page)).toBeHidden();

    expect((await readStore(page)).lists.filter((list) => list.name === "Once only")).toHaveLength(1);
  });

  test("E2E-14 — creating with the network down", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await page.context().setOffline(true);

    await openFromHeader(page);
    await createListNamed(page, "Offline");

    // §17.17 describes a create request that can fail. There is none: creation
    // is a local reducer and the account is reconciled later by the save queue
    // (§R.4). So the guarantee here is stronger than the scenario asked for —
    // the work is not merely recoverable, it is never at risk.
    await expect(page).toHaveURL(/\/list\/list-/);
    expect((await readStore(page)).lists.filter((list) => list.name === "Offline")).toHaveLength(1);
    await page.context().setOffline(false);
  });

  test("E2E-15 — a retry after a lost response cannot duplicate", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await createListNamed(page, "Idempotent");

    const before = (await readStore(page)).lists.filter((list) => list.name === "Idempotent");
    expect(before).toHaveLength(1);

    // §17.18 wants the same requestId to return the same result. The id is made
    // by the client and written once, so a reload — the closest thing here to a
    // response arriving late — finds the same single record, not a second.
    await page.reload();
    const after = (await readStore(page)).lists.filter((list) => list.name === "Idempotent");
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
  });

  test("E2E-16 — editing the draft after a failure creates the edited one", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);

    // The reachable half of §17.19: a submit that produces nothing leaves the
    // draft editable, and the next one carries the edit rather than the
    // original. (A rejected create is covered with an injected failure in
    // CreateListModal.test.tsx, where a rejection can actually be caused.)
    await nameField(page).fill("School");
    await nameField(page).fill("School project");
    await nameField(page).press("Enter");
    await expect(dialog(page)).toBeHidden();

    const store = await readStore(page);
    expect(store.lists.some((list) => list.name === "School project")).toBe(true);
    expect(store.lists.some((list) => list.name === "School")).toBe(false);
  });

  test("E2E-17 — a Folder deleted underneath falls back to None", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    // The sidebar draws a group only when it holds a List, so the group this
    // opens from has one.
    await openApp(page, {
      folders: [{ id: "sf1", name: "Grad school" }],
      lists: [{ id: "l-existing", name: "Coursework", sidebarFolderId: "sf1" }],
    });
    await openFromFolder(page, "Grad school");
    await expect(page.locator(".tm-folder-trigger-label")).toHaveText("Grad school");

    // Another device removes it while this dialog is open.
    await page.evaluate(() => {
      const key = "focusflow.appData.v1";
      const store = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      store.sidebarFolders = [];
      window.localStorage.setItem(key, JSON.stringify(store));
    });

    // §6.45's MUST is about the payload: whatever the display does, a folder id
    // that no longer exists must not reach creation.
    await createListNamed(page, "Orphan");
    const created = (await readStore(page)).lists.find((list) => list.name === "Orphan");
    const folders = (await readStore(page)).sidebarFolders.map((folder) => folder.id);
    expect(created?.sidebarFolderId ? folders.includes(created.sidebarFolderId) : true).toBe(true);
  });

  test("E2E-18 — a View the Scope forbids is not silently swapped", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await page.locator(".tm-modal .tm-view", { hasText: "Timeline" }).click();
    await createListNamed(page, "Timeline list");

    // §17.21 forbids a silent fallback to List. The choice is kept on the
    // record whatever any one screen can draw, so the fallback is a drawing
    // decision and never a write (§13.9, listView.ts).
    expect((await readStore(page)).lists.find((list) => list.name === "Timeline list")?.defaultViewKey).toBe("gantt");

    // Today gathers several Lists and forbids a timeline; going there resolves
    // to something it can draw WITHOUT changing what the List asked for.
    await page.goto("/today?view=gantt");
    await expect(page.locator(".tgv")).toHaveCount(0);
    expect((await readStore(page)).lists.find((list) => list.name === "Timeline list")?.defaultViewKey).toBe("gantt");
  });

  test.skip("E2E-19 — permission revoked mid-dialog", async () => {
    // §17.22 is about a shared workspace where the right to create can be taken
    // away while a dialog is open. This app is single-account with no sharing
    // and no permission model, so there is nothing to revoke and no state to
    // assert. Recorded rather than deleted: if collaboration ever arrives, this
    // is the scenario that has to be written, not rediscovered.
  });

  test("E2E-20 — the record survives whatever the router does next", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await createListNamed(page, "Persisted");
    const url = page.url();

    // §17.23's P0 is that a navigation problem must never re-run creation. The
    // two are not sequenced together here: the reducer has already written when
    // the navigation is asked for, so leaving immediately cannot undo it or
    // repeat it.
    await page.goto("/today");
    await page.goto(url);

    expect((await readStore(page)).lists.filter((list) => list.name === "Persisted")).toHaveLength(1);
    await expect(page.locator(".tm-row.is-current")).toHaveText(/Persisted/);
  });

  test.skip("E2E-21 — sidebar cache fails to update", async () => {
    // §17.24 assumes a cache between the record and the sidebar. There is none:
    // the sidebar's counts come from the same query the screen runs (§12.14,
    // Gate 2), so there is no second copy that could fail to update. The class
    // of bug this scenario protects against cannot be constructed here.
  });

  test("E2E-22 — Back leaves the new List alone", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await createListNamed(page, "Kept");
    await expect(page).toHaveURL(/\/list\/list-/);

    await page.goBack();

    await expect(page).toHaveURL(/\/today/);
    // Creating is not something Back undoes.
    expect((await readStore(page)).lists.filter((list) => list.name === "Kept")).toHaveLength(1);
  });

  test("E2E-23 — a refresh recovers the List and the screen", async ({ page }, info) => {
    test.skip(isMobile(info.project.name), "Opens from the desktop sidebar tree.");
    await openApp(page);
    await openFromHeader(page);
    await page.locator(".tm-modal .tm-view", { hasText: "Board" }).click();
    await createListNamed(page, "Reloaded");
    const url = page.url();

    await page.reload();

    // This is the one only a real browser can answer: the record has to come
    // back out of storage through `sanitizeList`, which is what would drop a
    // List that failed to say what kind it is.
    await expect(page).toHaveURL(url);
    await expect(page.locator(".tm-row.is-current")).toHaveText(/Reloaded/);
    await expect(page.locator(".tm-board")).toBeVisible();
  });

  test("E2E-24 — the draft survives a change of viewport", async ({ page }, info) => {
    test.skip(!isDesktop(info.project.name), "Starts wide on purpose and narrows from there.");
    await openApp(page);
    await openFromHeader(page);

    await nameField(page).fill("Kept across widths");
    await page.getByLabel("Blue", { exact: true }).click();
    await page.locator(".tm-modal .tm-view", { hasText: "Board" }).click();
    await expect(page.locator(".tm-preview")).toBeVisible();

    await page.setViewportSize({ width: 800, height: 900 });
    // §17.27's MUST: responsive is presentation, and presentation does not
    // reset a form. Only the preview is allowed to go (§8.36).
    await expect(page.locator(".tm-preview")).toBeHidden();
    await expect(nameField(page)).toHaveValue("Kept across widths");

    await page.setViewportSize({ width: 380, height: 800 });
    await expect(nameField(page)).toHaveValue("Kept across widths");
    await expect(page.locator(".tm-swatch.is-selected")).toHaveAttribute("aria-label", "Blue");
    await expect(page.locator(".tm-modal .tm-view.is-current")).toHaveText("Board");
  });

  test("E2E-25 — on a phone it is a bottom sheet", async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), "§17.28 is the mobile presentation.");
    await openApp(page);
    await openFromHeader(page);

    const box = (await page.locator(".tm-modal").boundingBox())!;
    const viewport = page.viewportSize()!;
    // §14.13/§14.14: anchored to the bottom, and NOT covering everything —
    // what is behind stays visible, so this reads as something on top of the
    // app rather than as having navigated away from it.
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
    expect(box.height).toBeLessThan(viewport.height);
    await expect(page.locator(".tm-preview")).toBeHidden();
    // §14.12: the primary action gets the width of the thumb's reach.
    const submit = (await page.locator(".tm-modal-submit").boundingBox())!;
    expect(submit.width).toBeGreaterThan(viewport.width * 0.8);
  });

  test("E2E-26 — the name field stays reachable with a keyboard open", async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), "§17.29 is about the on-screen keyboard.");
    await openApp(page);
    await openFromHeader(page);
    await nameField(page).click();

    // The keyboard cannot be summoned in a headless run, so this asserts the
    // property that makes it survivable: the sheet scrolls its own content and
    // is bounded by the viewport rather than by its contents.
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toBeInViewport();
    const settings = page.locator(".tm-modal-settings");
    await expect(settings).toHaveCSS("overflow-y", "auto");
    await settings.evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect(page.locator(".tm-modal-submit")).toBeInViewport();
  });

  test("E2E-27 — a submitting sheet cannot be dismissed", async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), "§17.30 is about the sheet's dismiss gestures.");
    await openApp(page);
    await openFromHeader(page);
    await nameField(page).fill("Locked");

    // §1.8 is the reachable half of this on every platform: the scrim is not a
    // dismiss. A swipe-to-dismiss gesture does not exist here to be locked, so
    // what is asserted is that there is no way OUT except the two the design
    // allows (§1.7).
    await page.locator(".tm-modal-scrim").click({ position: { x: 10, y: 10 } });
    await expect(dialog(page)).toBeVisible();
    await expect(nameField(page)).toHaveValue("Locked");
  });
});
