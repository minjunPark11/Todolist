import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/**
 * 아무것도 없을 때와 잘못됐을 때 화면이 말을 하는가.
 *
 * 이 리포의 빈 상태는 잘 되어 있다 — 검색이 안 잡히면 "Nothing matches that"
 * 옆에 "Create … as a task"를 내주고, 완료·휴지통·알림·캘린더가 각각 자기
 * 문장을 갖고 있다. 이 파일이 지키는 것은 그 문장들이 **화면에 닿는지**다.
 *
 * 닿지 않은 적이 있다. `App.tsx` 는 Tasks 모듈일 때 일찍 반환하는데, 그 분기가
 * 아래 분기의 것을 하나도 그리지 않아서 앱의 기본 화면에서만 오류 막대와
 * 토스트 더미가 사라져 있었다. 저장이 실패해도 아무 말이 없었고
 * (`setStorageError(true)` 는 불리고 문장도 있는데 그리는 쪽이 없었다),
 * 리마인더 토스트도 그 화면에서는 뜨지 않았다 [실측].
 */

/** 모든 화면이 들고 있어야 하는 것. 하나라도 빠지면 그 화면에서만 조용해진다. */
async function shellPieces(page: Page) {
  return page.evaluate(() => ({
    toastStack: !!document.querySelector(".toast-stack"),
  }));
}

async function railDestinations(page: Page): Promise<string[]> {
  return page.$$eval(".global-rail button", (els) => els.map((el) => el.getAttribute("aria-label") ?? "").filter(Boolean));
}

test("토스트 더미는 모든 화면에 있다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "막대가 데려가는 화면 전부를 도는 검사이고, 폭과 무관하다");
  testInfo.setTimeout(testInfo.timeout * 4);
  await openApp(page);

  const dests = await railDestinations(page);
  expect(dests.length, "레일이 갈 곳을 안 준다 — 이 검사는 아무것도 안 본 것이다").toBeGreaterThan(0);

  const missing: string[] = [];
  for (const dest of dests) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator(`.global-rail button[aria-label="${dest}"]`).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const pieces = await shellPieces(page);
    if (!pieces.toastStack) missing.push(dest);
  }

  expect(
    missing,
    `이 화면들에는 토스트 더미가 없다 — 리마인더를 포함해 어떤 토스트도 여기서는\n` +
      `뜨지 않는다:\n${missing.map((m) => `  ${m}`).join("\n")}`,
  ).toEqual([]);
});

test("로컬 저장이 실패하면 화면이 그렇게 말한다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "같은 이유");
  testInfo.setTimeout(testInfo.timeout * 3);

  // 저장이 실패하는 세상. 첫 읽기와 씨앗 심기는 되게 두고, 앱이 자리를 잡은 뒤부터
  // 계정 키에 대한 쓰기만 던진다.
  await page.addInitScript(() => {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    const real = proto.setItem;
    let armed = false;
    setTimeout(() => { armed = true; }, 2500);
    proto.setItem = function (key: string, value: string) {
      if (armed && String(key).startsWith("focusflow.appData")) {
        const error = new Error("QuotaExceededError (검사에서 만든 실패)");
        error.name = "QuotaExceededError";
        throw error;
      }
      return real.call(this, key, value);
    };
  });

  await openApp(page, { lists: [{ id: "l1", name: "목록" }] });
  await page.waitForTimeout(2800);

  // 쓰기를 유발한다.
  const trigger = page.locator(".tm-quickadd-trigger");
  if (await trigger.isVisible().catch(() => false)) await trigger.click();
  const field = page.locator(".tm-quickadd-title");
  await expect(field).toBeVisible();
  await field.fill("저장이 실패하는 동안 만든 할 일");
  await page.keyboard.press("Enter");

  const bar = page.locator(".storage-error-bar");
  await expect(bar, "저장이 실패했는데 화면이 조용하다 — 사용자는 저장된 줄 알고 창을 닫는다").toBeVisible({ timeout: 8000 });
  await expect(bar).toHaveAttribute("role", "alert");
  await expect(bar.locator("button"), "다시 시도할 길이 막대 안에 있어야 한다").toHaveCount(1);
});

test("빈 계정에서도 모든 화면이 말을 한다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "같은 이유");
  testInfo.setTimeout(testInfo.timeout * 4);
  await openApp(page);

  const silent: string[] = [];
  for (const dest of await railDestinations(page)) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator(`.global-rail button[aria-label="${dest}"]`).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    // 화면에 사람이 읽을 글자가 있는가. 빈 계정에서 빈 판을 내미는 화면을 찾는다.
    const words = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".tm-main") ?? document.querySelector<HTMLElement>("main");
      return (main?.innerText ?? "").replace(/\s+/g, " ").trim().length;
    });
    if (words < 20) silent.push(`${dest} (글자 ${words}자)`);
  }

  expect(silent, `빈 계정에서 아무 말도 하지 않는 화면:\n${silent.map((s) => `  ${s}`).join("\n")}`).toEqual([]);
});
