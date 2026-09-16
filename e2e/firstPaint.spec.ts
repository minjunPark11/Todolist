import { expect, test } from "@playwright/test";

/**
 * 불러오는 동안 무엇을 말하는가.
 *
 * 이 앱은 로컬 우선이고 계정을 `localStorage` 에서 **마운트 때 동기로** 읽는다.
 * 그래서 "불러오는 중"이라는 구간이 사실상 없다 — 셸이 처음 그려지는 프레임에
 * 이미 행이 다 있다 [실측].
 *
 *   지연 없음        셸 812ms  → 첫 행  812ms   (같은 프레임)
 *   요청마다 200ms   셸 2187ms → 첫 행 2187ms   (같은 프레임)
 *
 * 그 덕에 이 앱은 흔한 실패 하나를 피한다: **가진 사람에게 없다고 말하는 것**.
 * 할 일이 이백 개 있는 계정에서 "Nothing due today, and nothing overdue." 가
 * 한 프레임이라도 보이면, 읽는 사람은 자기 일이 사라진 줄 안다.
 *
 * 지금은 0 프레임이다. 이 파일은 그것을 지킨다 — 데이터 읽기가 언젠가 비동기가
 * 되면(IndexedDB 로 옮기거나 서버를 먼저 묻게 되면) 그 순간 이 검사가 깨진다.
 * 그때 필요한 것은 빈 상태가 아니라 뼈대(skeleton)다.
 *
 * `TasksModule` 에 `loading` prop 이 있는데 아무도 넘기지 않아 그 분기는 한 번도
 * 그려지지 않는다. 위의 측정과 앞뒤가 맞는다 — 보여줄 구간이 없으니 쓸 자리도
 * 없었다. 지우지 않고 적어만 둔다: 비동기가 되면 그 prop 이 쓰일 자리다.
 */

const KEY = "focusflow.appData.v1";

function seed(count: number): string {
  const today = new Date().toISOString().slice(0, 10);
  return JSON.stringify({
    tasks: Array.from({ length: count }, (_, i) => ({
      id: `t${i}`,
      title: `할 일 ${i + 1}`,
      listId: "l1",
      order: i,
      status: "todo",
      createdAt: "2026-08-18T00:00:00.000Z",
      dueDate: today,
    })),
    lists: [{ id: "l1", name: "목록", order: 0 }],
    projects: [],
    spaces: [],
    sidebarFolders: [],
    appSettings: { language: "en" },
  });
}

interface Frame {
  t: number;
  rows: number;
  saysEmpty: boolean;
}

test.describe("첫 페인트", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "프레임마다 기록하는 검사다");

  for (const [label, delayMs] of [
    ["지연 없이", 0],
    ["요청마다 200ms 느릴 때", 200],
  ] as const) {
    test(`이백 개를 가진 계정에게 "없다"고 말하지 않는다 — ${label}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
      testInfo.setTimeout(testInfo.timeout * 4);

      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key as string, value as string),
        [KEY, seed(200)] as const,
      );

      // 프레임마다 페이지 **안에서** 기록한다. 바깥에서 폴링하면 한두 프레임짜리
      // 번쩍임을 놓친다 — 놓치고 "없었다"고 말하는 것이 이 검사의 실패 방식이다.
      await page.addInitScript(() => {
        (window as unknown as { __frames: Frame[] }).__frames = [];
        const tick = () => {
          const frames = (window as unknown as { __frames: Frame[] }).__frames;
          if (document.querySelector(".tm-shell")) {
            const text = (document.body.innerText ?? "").replace(/\s+/g, " ");
            frames.push({
              t: Math.round(performance.now()),
              rows: document.querySelectorAll(".tm-task").length,
              saysEmpty: /Nothing due today|No lists yet|nothing overdue/i.test(text),
            });
          }
          if (frames.length < 400) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      if (delayMs) {
        await page.route("**/*", async (route) => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          await route.continue();
        });
      }

      await page.goto("/today");
      await expect(page.locator(".tm-task").first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(500);

      const frames = await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
      expect(frames.length, "한 프레임도 기록하지 못했다면 이 검사는 아무것도 안 본 것이다").toBeGreaterThan(3);

      const lying = frames.filter((f) => f.saysEmpty && f.rows === 0);
      expect(
        lying.map((f) => `${f.t}ms`),
        `할 일 이백 개를 가진 계정에게 "없다"고 말한 프레임이 있다. 읽는 사람은 자기 일이\n` +
          `사라진 줄 안다 — 데이터가 늦게 온다면 빈 상태가 아니라 뼈대를 보여야 한다.`,
      ).toEqual([]);

      // 그리고 셸이 나오는 프레임에 이미 행이 있다 — 비어 보이는 순간 자체가 없다.
      expect(frames[0].rows, "셸이 그려지는 첫 프레임에 이미 행이 있어야 한다").toBeGreaterThan(0);
    });
  }

  test("빈 계정에게는 비었다고 말한다 — 그물의 자기 점검", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");

    // 위 검사가 "없다는 말"을 아예 못 찾는 것이라면 통과는 침묵이다. 진짜로 빈
    // 계정에서는 그 말이 나와야 한다.
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      [KEY, seed(0)] as const,
    );
    await page.goto("/today");
    await expect(page.locator(".tm-shell")).toBeVisible();
    await expect(
      page.getByText(/Nothing due today|nothing overdue/i),
      "빈 계정에서 그 말을 못 찾는다면 위 검사는 찾을 수 없는 것을 찾고 있던 것이다",
    ).toBeVisible();
  });
});
