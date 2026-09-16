import { expect, test } from "@playwright/test";

/**
 * 켜둔 채 밤을 넘기면.
 *
 * `todayValue()` 는 부를 때마다 새로 읽는다. 문제는 **부를 일이 없었다는 것**이다 —
 * 자정에 다시 그리게 만드는 것이 앱에 없어서, 아침에 "Today" 가 어제를 보여줬다.
 * 오늘 마감인 할 일은 목록에 없고 어제 것이 남아 있고, 읽는 사람은 그것을 오늘의
 * 목록으로 읽는다. 할 일 앱을 켜둔 채 자는 것은 드문 일이 아니다.
 *
 * 23:59:30 에 열고 시계를 흘려보내니 5분이 지나도 `Today 1` 이었고, 화면을 한 번
 * 오가야 `Today 2` 가 됐다 [실측]. 값은 맞는데 아무도 다시 묻지 않았다.
 *
 * 재는 방법에 주의가 필요했다. `clock.fastForward` 로 십 분을 건너뛰면 화면이
 * 따라온 것처럼 보인다 — 그 API 가 타이머를 몰아 실행하면서 렌더가 한 번 일어나기
 * 때문이다. 시간이 실제로 흐르듯 보내는 `clock.runFor` 로 재야 결함이 보인다.
 * 이 파일은 `runFor` 로 잰다.
 */

const KEY = "focusflow.appData.v1";

/** 하루가 갈리는 자리. 하나는 오늘 마감, 하나는 내일 마감. */
const SEED = JSON.stringify({
  tasks: [
    { id: "t-today", title: "오늘 마감", listId: "l1", order: 0, status: "todo", createdAt: "2026-08-18T00:00:00.000Z", dueDate: "2026-09-16" },
    { id: "t-tomorrow", title: "내일 마감", listId: "l1", order: 1, status: "todo", createdAt: "2026-08-18T00:00:00.000Z", dueDate: "2026-09-17" },
  ],
  lists: [{ id: "l1", name: "목록", order: 0 }],
  projects: [],
  spaces: [],
  sidebarFolders: [],
  appSettings: { language: "en" },
});

test.describe("날이 바뀔 때", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "시계를 갈아끼우는 검사다");

  test("아무것도 건드리지 않아도 오늘이 따라온다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);

    await page.clock.install({ time: new Date("2026-09-16T23:59:30") });
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      [KEY, SEED] as const,
    );
    await page.goto("/today");
    await expect(page.locator(".tm-quickadd-trigger")).toBeVisible({ timeout: 60_000 });

    const dueToday = () =>
      page.evaluate(() => {
        const head = (document.querySelector<HTMLElement>(".tm-header")?.innerText ?? "").match(/\d+/);
        return head ? Number(head[0]) : -1;
      });

    expect(await dueToday(), "23:59 에는 오늘 마감이 하나다").toBe(1);

    // 시간이 흐르듯 보낸다. `fastForward` 는 타이머를 몰아 실행해 렌더를 한 번
    // 일으키므로, 따라오지 않는 화면도 따라온 것처럼 보인다.
    await page.clock.runFor("00:01:30");

    await expect
      .poll(dueToday, {
        message:
          "자정이 지났는데 화면이 어제를 보여준다 — 오늘 마감인 할 일이 목록에 없고\n" +
          "어제 것이 남아 있다. 켜둔 채 밤을 넘긴 사람은 그것을 오늘의 목록으로 읽는다.",
        timeout: 15_000,
      })
      .toBe(2);

    const body = await page.evaluate(() => (document.querySelector<HTMLElement>(".tm-main")?.innerText ?? "").replace(/\s+/g, " "));
    expect(body, "어제 마감이던 것은 지난 것으로 보여야 한다").toContain("오늘 마감 Sep 16");
    expect(body, "오늘이 된 것은 오늘로 보여야 한다").toContain("내일 마감 Today");
  });

  test("날이 그대로면 아무 일도 없다 — 그물의 자기 점검", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);

    // 자정에서 먼 시각. 위 검사가 "시간이 흐르면 숫자가 오른다"를 본 것이라면
    // 통과는 우연이다 — 여기서는 같은 시간을 흘려보내도 그대로여야 한다.
    await page.clock.install({ time: new Date("2026-09-16T13:00:00") });
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      [KEY, SEED] as const,
    );
    await page.goto("/today");
    await expect(page.locator(".tm-quickadd-trigger")).toBeVisible({ timeout: 60_000 });

    const before = await page.evaluate(() => (document.querySelector<HTMLElement>(".tm-header")?.innerText ?? "").match(/\d+/)?.[0]);
    await page.clock.runFor("00:05:00");
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => (document.querySelector<HTMLElement>(".tm-header")?.innerText ?? "").match(/\d+/)?.[0]);

    expect(after, "낮에 오 분이 흘렀다고 오늘이 바뀌면 안 된다").toBe(before);
  });
});
