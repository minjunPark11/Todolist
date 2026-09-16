import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/**
 * 할 일이 많아졌을 때.
 *
 * 이 목록은 가상화하지 않는다 — 있는 행을 전부 그린다. 그래서 비용이 개수에
 * 비례하고, 재보니 실제로 그랬다 [실측]:
 *
 *     개수    준비      DOM      타이핑(19자)
 *      100    810ms     961      70ms
 *     1000   1306ms    8161      69ms
 *     2000   1981ms   16161      95ms
 *     5000   3540ms   40161     187ms
 *    10000   5639ms   80164     375ms
 *
 * 무너지는 지점은 없었다. 선형이고, 개인용 할 일 앱이 실제로 갖는 크기(수백~
 * 2천)에서는 손에 걸리지 않는다. 그래서 가상화를 넣지 않는다 — 그것은 검사가
 * 아니라 다시 만드는 일이다.
 *
 * 이 파일이 지키는 것은 **선형이 이차로 바뀌지 않는 것**이다. 시간은 기계마다
 * 달라 검사로 삼으면 흔들리므로, 시간 대신 **행당 노드 수**를 본다. 한 행이
 * 여덟 노드다. 누군가 행 안에 상자를 몇 겹 더 두르면 이 숫자가 오르고, 그때
 * 위의 곡선도 같이 가팔라진다.
 */

/** 빈 화면이 이미 쓰는 노드. 행이 없을 때의 DOM 크기이고, 행당 계산에서 뺀다. */
const CHROME_NODES = 158;

/**
 * 한 행이 쓰는 노드의 천장.
 *
 * 지금은 정확히 8이다 (100 · 500 · 1000 · 2000 행에서 8.03 · 8.01 · 8 · 8).
 * 10 을 천장으로 두는 것은 한 줄짜리 여유이지 방향이 아니다 — 올려야 한다면
 * 왜 한 행에 상자가 더 필요한지가 먼저 적혀야 한다.
 */
const NODES_PER_ROW = 10;

/**
 * 리포의 씨앗 헬퍼로 연다.
 *
 * 처음에는 `localStorage` 에 직접 썼는데, 그 계정은 앱이 쓰기에 모자랐다 —
 * 퀵애드의 이름이 "Add a task to Inbox" 가 아니라 그냥 "Add a task" 로 나오고,
 * Enter 를 쳐도 아무것도 만들어지지 않았다. **0개에서도 그랬다** [실측], 그러니
 * 규모의 문제가 아니라 내 씨앗의 문제였다. `SeedOptions` 의 주석이 이 용도를
 * 이미 적어뒀다: "the wrong shape when a spec needs a list LONGER THAN THE
 * VIEWPORT — thirty round trips through the form to set up one scroll".
 */
async function openWith(page: Page, count: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await openApp(page, {
    lists: [{ id: "l1", name: "큰 목록" }],
    tasks: Array.from({ length: count }, (_, i) => ({
      id: `t${i}`,
      title: `할 일 ${i + 1}번 — 제목은 보통 이 정도 길이입니다`,
      listId: "l1",
      dueDate: today,
    })),
  });
  await expect(page.locator(".tm-task")).toHaveCount(count, { timeout: 60_000 });
}

/** 제자리 흐름의 요소가 부모 밖으로 나간 수. `longContent.spec.ts` 와 같은 눈이다. */
async function spills(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    for (const el of document.querySelectorAll(".tm-main *")) {
      const parent = el.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.position === "absolute") continue;
      const ps = getComputedStyle(parent);
      if (/auto|scroll/.test(ps.overflowX) || /auto|scroll/.test(ps.overflow)) continue;
      const box = el.getBoundingClientRect();
      const around = parent.getBoundingClientRect();
      if (around.width > 0 && Math.max(box.right - around.right, around.left - box.left) > 1) count += 1;
    }
    return count;
  });
}

test.describe("할 일이 많을 때", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "DOM 크기를 세는 검사다");

  test("행이 늘어도 한 행의 값은 그대로다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 6);

    await openWith(page, 1000);

    const nodes = await page.evaluate(() => document.querySelectorAll("*").length);
    const perRow = (nodes - CHROME_NODES) / 1000;

    expect(
      perRow,
      `한 행이 ${perRow.toFixed(2)}개의 노드를 쓴다. 여덟이었다 — 행 안에 상자가 더\n` +
        `생겼다면 그것이 천 배로 곱해진다. 위 표의 곡선도 같이 가팔라진다.`,
    ).toBeLessThanOrEqual(NODES_PER_ROW);
  });

  test("이천 행에서도 상자를 지킨다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 6);

    await openWith(page, 2000);

    expect(await spills(page), "행이 많아졌다고 레이아웃이 새면 안 된다").toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      "가로로 넘치면 안 된다",
    ).toBeLessThanOrEqual(0);
  });

  test("이천 행 위에서도 할 일을 하나 더 만들 수 있다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 6);

    await openWith(page, 2000);

    await page.locator(".tm-quickadd-trigger").click();
    const field = page.locator(".tm-quickadd-title");
    await field.fill("이천 개 위에 하나 더");
    await field.press("Enter");

    await expect(page.getByText("이천 개 위에 하나 더"), "이천 행 위에서 할 일을 만들지 못했다").toBeVisible({ timeout: 30_000 });
  });
});
