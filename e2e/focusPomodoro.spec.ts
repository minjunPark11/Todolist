// 휴식은 별도 화면이 아니라 포모도로 탭의 한 상태다
// (FOCUS_TABS_AND_RECORD_DESIGN.md §4.3).
//
// 지키려는 것은 두 가지이고, 둘 다 눈으로는 지나치기 쉬운 종류다.
//
//   ① 집중에서 휴식으로 넘어갈 때 **화면이 바뀌지 않는다**. 라벨 한 줄과 시계와
//      막대의 값만 바뀐다. 휴식을 별도 화면으로 만들면 "포모도로 탭" 이라는 이름이
//      두 개의 화면을 가리키게 된다.
//   ② 막대의 색은 상태를 나르지 않는다. 무엇인지는 라벨이 말한다. 색이 상태를
//      말하기 시작하면 이 화면의 파랑이 다시 둘이 되고, Phase 1 에서 하나로
//      모아둔 것이 풀린다.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

async function openPomodoro(page: Page, focusMinutes: string): Promise<void> {
  await page.clock.install();
  await openApp(page);
  await page.goto("/focus");
  await expect(page.getByRole("button", { name: "Start focus", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Focus settings", exact: true }).click();
  await page.getByLabel("Focus (minutes)", { exact: true }).fill(focusMinutes);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Pomodoro", exact: true }).click();
}

/** 막대의 채움색과 지금 채워진 비율. */
const bar = (page: Page) =>
  page.evaluate(() => {
    const fill = document.querySelector(".focus-progress > span") as HTMLElement | null;
    const track = document.querySelector(".focus-progress") as HTMLElement | null;
    if (!fill || !track) return null;
    return {
      color: getComputedStyle(fill).backgroundColor,
      now: track.getAttribute("aria-valuenow"),
    };
  });

test("휴식은 같은 화면의 한 상태다 — 라벨과 값만 바뀐다", async ({ page }) => {
  await openPomodoro(page, "1");

  // 집중 블록.
  await expect(page.getByText("Focus block · 1 min", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
  const focusing = await bar(page);
  expect(focusing).not.toBeNull();

  // 마감에 닿으면 휴식으로 넘어간다.
  await page.clock.runFor(61 * 1000);
  await expect(page.getByText("Taking a break", { exact: true })).toBeVisible();

  // ① 같은 자리들이 그대로 있다 — 시계도 막대도 사라지지 않는다.
  await expect(page.locator(".focus-time")).toBeVisible();
  await expect(page.locator(".focus-progress")).toBeVisible();
  await expect(page.getByText("Short break · 5 min", { exact: false })).toBeVisible();
  await expect(page.getByText("Focus block", { exact: false })).toHaveCount(0);

  // ② 채움색은 그대로다.
  const resting = await bar(page);
  expect(resting!.color, "휴식이라고 막대 색이 바뀌지 않는다").toBe(focusing!.color);

  // 그리고 주 버튼은 여전히 하나, 종료는 중립이다.
  await expect(page.locator(".focus-primary")).toHaveCount(1);
  await expect(page.locator(".focus-danger")).toHaveCount(0);
  await page.getByRole("button", { name: "End break", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start next focus", exact: true })).toBeVisible();
});

test("휴식이 끝나면 탭 제목도 휴식을 놓는다", async ({ page }) => {
  // 제목을 쓰는 곳이 둘이다. 하나는 집중 세션을 보고 쓰고, 세션이 없으면
  // 원래 제목으로 되돌린다. 다른 하나는 휴식 중에 남은 시간을 쓴다.
  //
  // 되돌리는 쪽은 자기 의존성이 바뀔 때만 다시 돈다 - 그런데 휴식이 끝나는
  // 순간 그 의존성은 하나도 바뀌지 않는다. 세션은 계속 없고(null), 그래서
  // 경과도 계속 0 이다. 쓰는 쪽은 멈추고 되돌리는 쪽은 돌지 않아, 제목만
  // 휴식에 남는다.
  await openPomodoro(page, "1");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();

  await page.clock.runFor(61 * 1000);
  await expect(page.getByText("Taking a break", { exact: true })).toBeVisible();

  // 자기 점검: 제목이 애초에 휴식을 말하고 있어야 아래가 무언가를 잰다.
  await expect.poll(() => page.title()).toMatch(/break/i);

  await page.getByRole("button", { name: "End break", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start next focus", exact: true })).toBeVisible();

  // 휴식은 끝났다. 제목이 계속 휴식을 말하면 탭 목록에서 이 탭은 영영
  // 쉬고 있는 것으로 보인다.
  await expect.poll(() => page.title()).not.toMatch(/break/i);
});

test("스톱워치에는 블록이 없으므로 라벨도 막대도 없다", async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await page.goto("/focus");
  await expect(page.getByRole("button", { name: "Start focus", exact: true })).toBeVisible();

  // 스톱워치는 끝이 정해져 있지 않다 — 진행률이라는 개념 자체가 없다.
  await expect(page.locator(".focus-progress")).toHaveCount(0);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
  await expect(page.locator(".focus-progress")).toHaveCount(0);
});
