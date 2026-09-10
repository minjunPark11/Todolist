// 타이머 · 포모도로 · 기록을 같은 높이에 둔 뒤의 규칙들
// (FOCUS_TABS_AND_RECORD_DESIGN.md §1 · §3).
//
// 탭이 만든 문제 하나를 여기서 지킨다. 지금까지는 측정 토글이 **세션이 없을 때만
// 렌더**돼서 "도는 중에는 못 바꾼다"가 저절로 성립했다. 탭 줄은 늘 보이므로 그 규칙을
// 코드가 직접 들고 있어야 하고, 들고 있는지 아무도 검사하지 않으면 다음 사람이
// 조건 하나를 지우면서 스톱워치 세션 위에 포모도로를 얹게 된다.
//
// jsdom 으로는 안 된다 — 잠긴 탭이 초점을 받는지, 눌렸을 때 이유가 화면에 뜨는지는
// 실제 이벤트 루프와 레이아웃이 있어야 답이 나온다.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const store = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);

async function openFocus(page: Page): Promise<void> {
  await page.clock.install();
  await openApp(page);
  await page.goto("/focus");
  await expect(page.getByRole("button", { name: "Start focus", exact: true })).toBeVisible();
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

test("세 화면이 한 줄에 서고, 고른 탭이 측정 방식을 정한다", async ({ page }) => {
  await openFocus(page);

  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(tab(page, "Timer")).toHaveAttribute("aria-selected", "true");

  // 포모도로는 이제 화면 안의 토글이 아니라 탭이다.
  await tab(page, "Pomodoro").click();
  await expect(tab(page, "Pomodoro")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
  expect((await store(page)).focusSessions[0].measurementMode).toBe("pomodoro");
});

test("도는 세션이 측정 방식을 잠그고, 왜 잠겼는지 말한다", async ({ page }) => {
  await openFocus(page);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();

  const pomodoro = tab(page, "Pomodoro");
  await expect(pomodoro).toHaveAttribute("aria-disabled", "true");

  // 이유는 **누르기 전에** 닿아야 한다. 보조기술도 자동화 도구도 `aria-disabled` 를
  // "누를 수 없음" 으로 읽으므로(이 클릭은 force 없이는 거부된다), 누르면 말하는
  // 설계에서는 이유가 영원히 도착하지 않는 사람이 생긴다. 그래서 설명이 컨트롤에
  // 붙어 있는지를 잰다 — 이 스펙이 지키는 것은 문구가 아니라 그 경로다.
  await expect(pomodoro).toHaveAccessibleDescription(/switch timers mid-session/i);
  await expect(pomodoro).toHaveAttribute("title", /switch timers mid-session/i);

  // 그래도 누른 사람에게는 화면이 한 번 더 말하고, 측정 방식은 그대로다.
  await pomodoro.click({ force: true });
  await expect(
    page.getByRole("status").filter({ hasText: /switch timers mid-session/i }),
  ).toBeVisible();
  await expect(tab(page, "Timer")).toHaveAttribute("aria-selected", "true");
  expect((await store(page)).focusSessions[0].measurementMode).toBe("stopwatch");

  // 기록은 잠기지 않는다. 도는 세션을 두고 지난 기록을 볼 이유가 있고, 그동안
  // 전역 집중 바가 세션을 계속 들고 있다.
  await tab(page, "Records").click();
  await expect(page.locator(".focus-records")).toBeVisible();
  await expect(page.getByText("Focusing", { exact: true })).toHaveCount(0);

  await tab(page, "Timer").click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
});

test("세션이 끝나면 잠금이 풀린다", async ({ page }) => {
  await openFocus(page);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.clock.fastForward(5000);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("Focus recorded", { exact: true })).toBeVisible();

  const pomodoro = tab(page, "Pomodoro");
  await expect(pomodoro).not.toHaveAttribute("aria-disabled", "true");
  await pomodoro.click();
  await expect(pomodoro).toHaveAttribute("aria-selected", "true");
});
