import { test, expect } from "@playwright/test";
import { openApp } from "./addList.helpers";

test("settings groups remain usable at each viewport", async ({ page }, info) => {
  await openApp(page);
  await page.goto("/settings");
  const content = page.locator(".ff-settings-content");
  await expect(content.getByRole("heading", { name: "General", exact: true })).toBeVisible();
  const select = async (id: string, name: string) => {
    const compact = page.locator(".ff-settings-mobile-nav select");
    if (await compact.isVisible()) await compact.selectOption(id);
    else await page.getByRole("tab", { name, exact: true }).click();
    await expect(content.getByRole("heading", { name, exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow, `${name} should not overflow`).toBe(false);
  };
  await page.screenshot({ path: info.outputPath("general.png"), fullPage: true });
  await select("notifications", "Notifications");
  await expect(content.getByRole("switch")).toHaveCount(1);
  await expect(content.locator("details")).not.toHaveAttribute("open");
  await content.locator("summary").click();
  await expect(content.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await select("account", "Account & sync");
  await expect(content.locator("summary").filter({ hasText: "Access permissions" })).toHaveCount(1);
  // In-memory review fixture; no connected account or external writes.
  await page.evaluate(async () => {
    const modulePath = "/src/lib/googleTaskSyncState.ts";
    const { publishGoogleTaskSync } = await import(modulePath);
    const task = { id: "review-fixture", title: "Draft proposal", dueDate: "2026-09-10", description: "Long notes ".repeat(100) };
    publishGoogleTaskSync({ enabled: true, busy: false, pending: false, error: "", snapshot: null, autoMergedCount: 2,
      localConflicts: [{ id: task.id, local: task, remote: { id: task.id, revision: 2, data: { ...task, title: "Team proposal" } } }] });
  });
  await content.getByText(/Draft proposal —/).click();
  await expect(content.getByRole("button", { name: "Use saved version" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("device-review.png"), fullPage: true });
  await page.evaluate(async () => {
    const modulePath = "/src/lib/googleTaskSyncState.ts";
    const { publishGoogleTaskSync } = await import(modulePath);
    publishGoogleTaskSync({ enabled: false, busy: false, pending: false, error: "", snapshot: null });
  });
  await select("connections", "Connections");
  await page.screenshot({ path: info.outputPath("connections.png"), fullPage: true });
  await select("data", "Backup & restore");
  await expect(content.locator(".ff-settings-danger")).not.toHaveAttribute("open");
  await expect(content.getByRole("button", { name: /reset/i })).toHaveCount(0);
  await select("about", "About");
  await select("general", "General");
  await content.getByText("Calendar display", { exact: true }).click();
  await expect(content.getByRole("combobox")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await content.getByRole("tab", { name: "Dark", exact: true }).click();
  await page.screenshot({ path: info.outputPath("general-dark.png"), fullPage: true });
});
