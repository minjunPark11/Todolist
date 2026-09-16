import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * 되돌리기가 어디까지인가 (§16.19, §16.21).
 *
 * `undoStack.ts` 는 잘 지어져 있다 — 150ms 안의 연속 푸시를 한 묶음으로 묶고,
 * 100 개에서 끊고, 되돌릴 수 없게 된 항목은 `false` 를 돌려 **거절**한다.
 * 거절이 있는 이유를 그 파일의 주석이 적어뒀다: 되돌리기 항목 하나가
 * `PlannerData` **전체**를 들고 있으므로, 저장소가 그 사이에 다른 것으로
 * 바뀌었다면 그것을 되살리는 일은 편집 한 걸음을 물리는 것이 아니라 그
 * 사이에 들어온 것을 전부 떨어뜨리는 일이 된다. §16.21 이 일반형이다.
 *
 * 그 규칙을 지키라고 `storeRevisionRef` 가 있고, 저장소를 갈아끼우는 자리마다
 * 그 번호를 올린다 — 원격 적재, 마이그레이션 업로드, 집중 전이, 구글 충돌
 * 해소까지 여섯 곳이다. **한 곳만 빼고.** 옆 탭의 쓰기를 받아 자기 상태를
 * 통째로 갈아끼우는 `storage` 처리기가 번호를 올리지 않는다.
 *
 * 재보면 이렇게 된다 [실측]:
 *
 *   A 가 할 일을 만든다        → 저장소 ["A가 만든 것"]
 *   B 가 할 일을 만든다        → 저장소 ["B가 만든 것", "A가 만든 것"]
 *   A 가 그것을 받는다         → 화면에 둘 다 보인다
 *   A 에서 Ctrl+Z             → 저장소 []
 *
 * 자기 편집이 물러난 것은 맞다. B 가 만든 것까지 같이 사라진 것은 아니다 —
 * 그리고 다음 저장이 그 없음을 삭제로 읽어 계정에서도 지운다. 주석이 말한
 * 바로 그 일이 주석이 다루지 않은 한 경로에서 일어나고 있었다.
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

async function seed(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) window.localStorage.setItem(key as string, value as string);
    },
    [KEY, SEED] as const,
  );
}

async function openTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/today");
  await expect(page.locator(".tm-shell")).toBeVisible();
  // 퀵애드가 어느 목록에 넣을지 정해질 때까지. `twoTabs.spec.ts` 가 같은
  // 이유로 같은 것을 기다린다.
  await expect(page.locator(".tm-quickadd-trigger")).toHaveAccessibleName(/Add a task to/);
  return page;
}

async function addTask(page: Page, title: string): Promise<void> {
  if (!(await page.locator(".tm-quickadd-title").count())) {
    await page.locator(".tm-quickadd-trigger").click();
  }
  await page.locator(".tm-quickadd-title").fill(title);
  // 요소에 직접 보낸다 — `page.keyboard` 는 앞에 세운 탭으로 간다.
  await page.locator(".tm-quickadd-title").press("Enter");
  await expect(page.getByText(title)).toBeVisible();
  await page.locator(".tm-quickadd-title").press("Escape");
}

function storedTitles(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw).tasks ?? []) as { title: string }[]).map((t) => t.title).sort() : [];
  }, KEY);
}

/**
 * Ctrl+Z 를 **문서에** 보낸다.
 *
 * `page.keyboard` 는 앞에 세운 탭으로 가므로 두 탭을 번갈아 쓰는 검사에서는
 * 엉뚱한 쪽이 받는다. 앱의 처리기는 `window` 의 keydown 을 듣고 입력칸이
 * 대상이면 비켜서므로, 대상이 `body` 인 이벤트 하나면 그 조건을 그대로
 * 만족한다.
 */
async function pressUndo(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
  });
  await page.waitForTimeout(400);
}

test.describe("되돌리기의 경계", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "같은 컨텍스트의 두 페이지가 필요하다");

  test("이 탭의 편집은 Ctrl+Z 로 물러난다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);
    await seed(context);
    const page = await openTab(context);

    // 아래 두 검사는 "되돌리기가 아무것도 하지 않으면" 전부 통과한다.
    // 되돌리기가 살아 있다는 것을 먼저 고정해 둔다.
    await addTask(page, "물러날 것");
    expect(await storedTitles(page)).toEqual(["물러날 것"]);

    await pressUndo(page);
    expect(await storedTitles(page), "자기 편집은 물러나야 한다").toEqual([]);
    await expect(page.locator(".toast-stack"), "물러났다고 말해야 한다").toContainText("Undone");
  });

  test("옆 탭이 만든 것은 이 탭의 Ctrl+Z 에 쓸려나가지 않는다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await seed(context);

    const a = await openTab(context);
    const b = await openTab(context);

    await addTask(a, "A가 만든 것");
    await expect(b.getByText("A가 만든 것"), "B 가 A 의 것을 받아야 한다").toBeVisible();

    await addTask(b, "B가 만든 것");
    // A 가 정말 받았는지 확인하고 나서야 이 검사가 성립한다 — 못 받았다면
    // 재는 것이 "옆 탭의 쓰기를 삼킨 되돌리기"가 아니라 "옆 탭의 쓰기를
    // 못 받은 탭"이 된다.
    await expect(a.getByText("B가 만든 것"), "A 가 B 의 것을 받아야 한다").toBeVisible();

    await pressUndo(a);

    const left = await storedTitles(a);
    expect(left, `A 의 되돌리기가 B 의 것을 지웠다 (남은 것: ${JSON.stringify(left)})`).toContain("B가 만든 것");
    // 그리고 B 의 화면에서도 사라지지 않아야 한다 — 저장소만 맞고 화면이
    // 비면 다음 저장이 그 비어 있음을 쓴다.
    await expect(b.getByText("B가 만든 것"), "B 의 화면에서도 남아야 한다").toBeVisible();
  });

  test("되돌릴 수 없게 된 자리에서 Ctrl+Z 는 조용히 지나가지 않는다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await seed(context);

    const a = await openTab(context);
    const b = await openTab(context);
    await addTask(a, "A가 만든 것");
    await expect(b.getByText("A가 만든 것")).toBeVisible();
    await addTask(b, "B가 만든 것");
    await expect(a.getByText("B가 만든 것")).toBeVisible();

    await pressUndo(a);
    // 거절 자체는 옳다. 옳은 거절을 아무 말 없이 하면, 방금 Ctrl+Z 를 누른
    // 사람에게는 키가 죽은 것과 구분되지 않는다 — 그리고 대개 한 번 더
    // 누른다.
    // 글까지 본다. "아무것도 없었다"와 "그 편집은 이제 못 되돌린다"는
    // 서로 다른 말이고, 사람이 알아야 하는 것은 뒤쪽이다 — 방금 만든
    // 것이 눈앞에 있는데 "되돌릴 것이 없다"고 하면 그것은 거짓말이다.
    await expect(a.locator(".toast-stack"), "왜 아무 일도 없었는지 말해야 한다").toContainText(
      /can no longer be undone/i,
    );
  });

  test("자기 점검: 되돌리기는 메모리에만 있다 — 새로고침하면 남지 않는다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await seed(context);
    const page = await openTab(context);

    await addTask(page, "새로고침을 건널 것");
    expect(await storedTitles(page)).toEqual(["새로고침을 건널 것"]);

    await page.reload();
    await expect(page.locator(".tm-shell")).toBeVisible();
    await expect(page.getByText("새로고침을 건널 것")).toBeVisible();

    // 경계를 고정해 두는 검사다. 되돌리기 스택은 `undoStack.ts` 의 모듈
    // 변수이므로 새로고침하면 빈다 — 그것이 설계이고, 이 검사는 그것이
    // 조용히 반대로 바뀌지 않도록 못을 박는다. 더 중요한 것은 두 번째
    // 단언이다: 빈 스택에서 누른 Ctrl+Z 가 **아무것도 지우지 않아야** 한다.
    await pressUndo(page);
    expect(await storedTitles(page), "빈 스택의 Ctrl+Z 가 무언가를 지우면 안 된다").toEqual(["새로고침을 건널 것"]);
  });
});
