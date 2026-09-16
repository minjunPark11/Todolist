import { expect, test, type Page } from "@playwright/test";
import { openApp, openQuickAdd } from "./addList.helpers";

/**
 * 되돌릴 수 없는 것 앞에는 관문이 있어야 한다 (§9.45).
 *
 * 그 절의 요지는 "모든 삭제를 확인하라"가 아니다 — 되돌릴 수 있는 것은 그냥
 * 하고 되돌리기를 옆에 두라는 쪽이다. 그래서 이 파일은 양쪽을 다 본다:
 * 휴지통으로 보내는 것은 **막히지 않아야** 하고, 계정에서 지우는 것은
 * **막혀야** 한다.
 *
 * 재보니 셋 다 막혀 있었다. 대화상자가 무슨 일이 일어나는지까지 말한다 —
 * "1 tasks leave the trash and the account. Subtasks stay, at the top level."
 * 초기화는 한 겹 더 있다: 접힌 `<details>` 안에 들어 있어서 지나가다 누를 수
 * 없다.
 *
 * 그래서 고치는 쪽이 아니라 고정하는 쪽이다. 관문은 조용히 사라질 수 있다 —
 * 검사 ④ 에서 `AppModals` 가 한 분기에서만 빠져 있던 것이 그 예다.
 */

/** 화면을 덮고 있는 확인 대화상자의 글. 없으면 `null`. */
async function gateText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[role=dialog], .ff-modal-backdrop, .tm-modal-scrim");
    return el ? (el.innerText ?? "").replace(/\s+/g, " ").trim() : null;
  });
}

async function taskCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("focusflow.appData.v1");
    return raw ? ((JSON.parse(raw).tasks ?? []) as unknown[]).length : 0;
  });
}

/** 할 일 하나를 만들고 휴지통으로 보낸 뒤, 휴지통 화면에 선다. */
async function taskInTrash(page: Page, title: string): Promise<void> {
  const field = await openQuickAdd(page);
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByText(title)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator(`button.tm-task-menu[aria-label*="${title}"]`).first().click();
  await page.locator("button").filter({ hasText: /Move to trash/i }).first().click();

  await page.locator(".tm-row").filter({ hasText: /Trash/ }).first().click();
  await expect(page.getByText(title), "휴지통에 있어야 한다").toBeVisible();
}

test.describe("되돌릴 수 없는 것 앞의 관문", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "대화상자를 열고 닫는 검사다");

  test("휴지통으로 보내는 것은 막지 않는다 — 되돌릴 수 있으니까", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });

    const field = await openQuickAdd(page);
    await field.fill("버릴 할 일");
    await field.press("Enter");
    await expect(page.getByText("버릴 할 일")).toBeVisible();
    await page.keyboard.press("Escape");

    const before = await taskCount(page);
    await page.locator('button.tm-task-menu[aria-label*="버릴 할 일"]').first().click();
    await page.locator("button").filter({ hasText: /Move to trash/i }).first().click();

    expect(await gateText(page), "되돌릴 수 있는 것을 막으면 §9.45 가 말한 균형이 깨진다").toBeNull();
    expect(await taskCount(page), "휴지통행은 지우는 것이 아니다 — 계정에 남는다").toBe(before);
  });

  test("휴지통 비우기는 막힌다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });
    await taskInTrash(page, "비우기로 사라질 할 일");

    const before = await taskCount(page);
    await page.locator('button[aria-label="Empty trash"]').first().click();

    const gate = await gateText(page);
    expect(gate, "확인 없이 계정에서 지우면 안 된다").not.toBeNull();
    expect(gate, "무엇이 사라지는지 말해야 한다").toMatch(/trash/i);
    expect(await taskCount(page), "누르기 전에는 아무것도 사라지지 않는다").toBe(before);

    await page.keyboard.press("Escape");
    await expect(page.getByText("비우기로 사라질 할 일"), "물러나면 그대로 남는다").toBeVisible();
    expect(await taskCount(page)).toBe(before);
  });

  test("영구 삭제는 막힌다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });
    await taskInTrash(page, "영원히 사라질 할 일");

    const before = await taskCount(page);
    await page.locator('button[aria-label*="Actions for 영원히 사라질 할 일"]').first().click();
    await page.locator("button").filter({ hasText: /Delete forever/i }).first().click();

    expect(await gateText(page), "확인 없이 영구 삭제하면 안 된다").not.toBeNull();
    expect(await taskCount(page), "누르기 전에는 그대로다").toBe(before);
  });

  test("모든 데이터 초기화는 막히고, 지나가다 누를 수 없다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });

    const field = await openQuickAdd(page);
    await field.fill("초기화로 사라질 할 일");
    await field.press("Enter");
    await expect(page.getByText("초기화로 사라질 할 일")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator('.global-rail button[aria-label="Settings"]').click();
    await page.locator("button").filter({ hasText: /^Backup & restore$/ }).first().click();

    const reset = page.locator("button.ff-btn-danger").filter({ hasText: /Reset All Data/i }).first();
    await expect(reset, "접힌 카드 안에 있어야 한다 — 지나가다 누를 자리가 아니다").toBeHidden();

    // 사람이 하듯 카드를 펼친다.
    await page.locator("summary").filter({ hasText: /Danger|Reset|Data/i }).first().click().catch(async () => {
      await page.locator("details summary").last().click();
    });
    await expect(reset).toBeVisible();

    const before = await taskCount(page);
    await reset.click();

    const gate = await gateText(page);
    expect(gate, "확인 없이 전부 지우면 안 된다").not.toBeNull();
    expect(gate, "무엇이 사라지는지 말해야 한다").toMatch(/permanently deletes/i);
    expect(await taskCount(page), "누르기 전에는 그대로다").toBe(before);
  });
});
