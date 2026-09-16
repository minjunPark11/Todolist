import { expect, test, type Page } from "@playwright/test";

/**
 * 탭 두 개가 같은 계정을 볼 때.
 *
 * 이 앱은 로컬 우선이고, 두 탭은 같은 `localStorage` 를 공유한다. 둘을 이어주는
 * 것은 `usePlannerData.ts` 의 `storage` 이벤트 하나다 — 한쪽이 쓰면 다른 쪽이
 * 그것을 읽어 자기 상태를 갈아끼운다. 데이터가 걸린 경로인데 검사가 없었다.
 *
 * 실제로 재보니 잃는 자리는 없었다. 간격을 0 · 10 · 25 · 50 · 100 · 200 · 400ms
 * 로 훑었고, **같은 틱에 두 이벤트를 밀어넣은 0ms 에서만** 한쪽이 사라졌다
 * [실측]. 10ms 면 이미 둘 다 남는다 — 사람이 두 탭에서 만들 수 없는 간격이라
 * 결함으로 세지 않는다. 그래서 이 파일은 고치는 쪽이 아니라 그 상태를 고정하는
 * 쪽이다.
 *
 * 로그인 상태는 여기서 못 본다. 그때는 `next.tasks = dataRef.current.tasks` 가
 * 들어오는 할 일을 버리는데, 주석이 이유를 적어뒀다 — 서버 리비전이 있는 쪽을
 * 믿고 리비전 없는 로컬 방송은 할 일에 대해 신뢰하지 않는다. 이 환경에는 인증이
 * 없으므로 검사하지 않고 적어만 둔다.
 */

const KEY = "focusflow.appData.v1";

const SEED = JSON.stringify({
  tasks: [],
  lists: [{ id: "l1", name: "공용 목록", order: 0 }],
  projects: [],
  spaces: [],
  sidebarFolders: [],
  appSettings: { language: "en" },
});

async function openTab(context: import("@playwright/test").BrowserContext): Promise<Page> {
  const page = await context.newPage();
  // 리포의 `openApp` 과 같은 자리로 간다 — `/` 는 모듈은 띄우지만 퀵애드가
  // 어느 목록에 넣을지 정해지지 않은 화면일 수 있다.
  await page.goto("/today");
  await expect(page.locator(".tm-shell")).toBeVisible();
  // `.tm-shell` 이 보이는 것과 퀵애드가 쓸 준비가 된 것은 다르다. 트리거의 이름이
  // "Add a task to …" 로 목록을 말할 때 비로소 넣을 곳이 정해진 것이고, 그 전에
  // Enter 를 치면 글자는 남는데 아무것도 만들어지지 않는다 [실측 — 탭을 하나만
  // 여는 검사에서만 실패했다. 탭을 둘 여는 쪽은 두 번째를 여느라 그 시간을 벌고
  // 있었을 뿐이다].
  await expect(page.locator(".tm-quickadd-trigger")).toHaveAccessibleName(/Add a task to/);
  return page;
}

async function addTask(page: Page, title: string): Promise<void> {
  // 이미 열려 있을 수도 있다 — 앞 차례가 열어둔 채로 둔다.
  if (!(await page.locator(".tm-quickadd-title").count())) {
    await page.locator(".tm-quickadd-trigger").click();
  }
  await page.locator(".tm-quickadd-title").fill(title);
  // 요소에 직접 보낸다. `page.keyboard` 는 앞에 세운 탭으로 가므로, 두 탭을
  // 번갈아 두드리면 한쪽의 입력이 다른 쪽으로 새어 "잃었다"는 없는 결함이
  // 보인다 [실측 — 처음 이 검사를 그렇게 썼다].
  await page.locator(".tm-quickadd-title").press("Enter");
}

function storedTitles(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw).tasks ?? []) as { title: string }[]).map((t) => t.title).sort() : [];
  }, KEY);
}

test.describe("탭 두 개", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "같은 컨텍스트의 두 페이지가 필요하다");

  test("한쪽에서 만든 것이 다른 쪽에 나타나고, 어느 쪽도 상대를 지우지 않는다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관한 검사다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);

    await context.addInitScript(
      ([key, value]) => {
        if (!window.localStorage.getItem(key as string)) window.localStorage.setItem(key as string, value as string);
      },
      [KEY, SEED] as const,
    );

    const first = await openTab(context);
    const second = await openTab(context);

    await addTask(first, "첫째 탭이 만든 것");
    await expect(first.getByText("첫째 탭이 만든 것"), "만든 탭에 먼저 보여야 한다").toBeVisible();
    await expect(second.getByText("첫째 탭이 만든 것"), "둘째 탭이 그것을 받아야 한다").toBeVisible();

    await addTask(second, "둘째 탭이 만든 것");
    await expect(first.getByText("둘째 탭이 만든 것"), "첫째 탭이 그것을 받아야 한다").toBeVisible();

    // 그리고 먼저 만든 것이 그 사이에 사라지지 않았다.
    await expect(first.getByText("첫째 탭이 만든 것"), "둘째 탭의 쓰기가 첫째의 것을 덮으면 안 된다").toBeVisible();

    expect(await storedTitles(first)).toEqual(["둘째 탭이 만든 것", "첫째 탭이 만든 것"].sort());
    expect(await storedTitles(second), "두 탭이 같은 저장소를 본다").toEqual(await storedTitles(first));
  });

  test("옆 탭이 읽을 수 없는 것을 방송해도 이 탭은 계속 쓴다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 2);

    await context.addInitScript(
      ([key, value]) => {
        if (!window.localStorage.getItem(key as string)) window.localStorage.setItem(key as string, value as string);
      },
      [KEY, SEED] as const,
    );

    const page = await openTab(context);
    await addTask(page, "방송 전에 만든 것");
    await expect(page.getByText("방송 전에 만든 것")).toBeVisible();

    // 다른 탭이 반쪽짜리 스냅샷을 쓴 것처럼 꾸민다. `storage` 이벤트는 다른
    // 문서에서만 오므로 직접 만들어 보낸다.
    await page.evaluate((key) => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: '{"tasks":[{"id":"x","title":"잘린', storageArea: window.localStorage }),
      );
    }, KEY);
    await page.waitForTimeout(500);

    await expect(page.getByText("방송 전에 만든 것"), "읽을 수 없는 방송에 화면이 지워지면 안 된다").toBeVisible();

    await addTask(page, "방송 뒤에 만든 것");
    await expect(page.getByText("방송 뒤에 만든 것"), "그 뒤로도 계속 쓸 수 있어야 한다").toBeVisible();
    expect(await storedTitles(page)).toEqual(["방송 뒤에 만든 것", "방송 전에 만든 것"].sort());
  });
});
