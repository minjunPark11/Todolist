import { expect, test, type Page } from "@playwright/test";
import { openApp, openQuickAdd } from "./addList.helpers";

/**
 * 대화상자가 포커스를 어떻게 잡고 어디로 돌려주는가 (§19.32 / §19.34).
 *
 * §19.34 는 이름까지 적어 두었다 — "Focus trap / background inert 는
 * Modal/Dialog 에만 적용한다. Confirmation Dialog, Recurring Scope Dialog".
 * `kit.tsx` 의 주석도 "it traps focus" 라고 적고 있었다. 재보면 둘 다
 * 없었다: "휴지통 비우기" 확인 대화상자에서 Tab 을 한 번 누르면 뒤에 깔린
 * 사이드바의 접기 버튼으로 나갔고, 여섯 번 누르면 레일의 Tasks/Matrix/
 * Calendar 를 차례로 걸어다녔다. 배경은 `aria-modal="true"` 로 보조기술에서
 * 가려져 있으므로, 화면 낭독기 사용자에게는 존재하지 않는다고 말해 둔 것을
 * 키보드가 밟고 다니는 상태였다.
 *
 * 닫은 뒤도 마찬가지였다. Tab 을 한 번도 안 눌렀으면 포커스는 `body` 로
 * 떨어졌다 — 되돌릴 수 없는 일을 방금 물린 사람이 처음부터 Tab 을 다시
 * 밟아야 한다는 뜻이다.
 *
 * 이 파일이 고정하는 것은 세 가지다: 안에 갇힐 것, 연 자리로 돌아올 것,
 * 연 자리가 사라졌으면 §19.32 의 "stable fallback" 으로 갈 것.
 */

/** 지금 포커스가 있는 요소를 사람이 읽을 수 있는 한 줄로. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""}[${label}]`;
  });
}

/** 포커스가 대화상자 안(또는 거기서 연 떠 있는 층 안)에 있는가. */
async function focusInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector("section[role=dialog]");
    if (!dialog) return false;
    const active = document.activeElement;
    if (!active) return false;
    return dialog.contains(active) || !!document.getElementById("floating-layer-root")?.contains(active);
  });
}

/** 할 일 하나를 휴지통에 넣고 휴지통 화면에 선다. */
async function taskInTrash(page: Page, title: string): Promise<void> {
  const field = await openQuickAdd(page);
  await field.fill(title);
  await field.press("Enter");
  await expect(page.getByText(title)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(`button.tm-task-menu[aria-label*="${title}"]`).first().click();
  await page.locator("button").filter({ hasText: /Move to trash/i }).first().click();
  await page.locator(".tm-row").filter({ hasText: /Trash/ }).first().click();
  await expect(page.getByText(title)).toBeVisible();
}

test.describe("대화상자의 포커스", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "키보드 순서를 재는 검사다");

  test("확인 대화상자는 Tab 을 가두고, 닫으면 연 버튼으로 돌려준다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });
    await taskInTrash(page, "포커스를 볼 할 일");

    const opener = page.locator('button[aria-label="Empty trash"]').first();
    await opener.click();
    await expect(page.locator("section.ff-confirm")).toBeVisible();

    // 확인 버튼이 먼저 잡힌다 — Enter 가 바로 확정이 되도록 (§kit).
    expect(await focused(page), "확인 버튼에서 시작해야 한다").toContain("Empty trash");

    // 고치기 전에는 첫 번째 Tab 에서 이미 나갔다. 여섯 번을 도는 것은
    // 고리가 실제로 닫혀 있는지 보기 위해서다 — 한 번만 재면 "다음 칸이
    // 마침 안에 있었다"와 구분되지 않는다.
    const walk: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      walk.push(`${(await focusInsideDialog(page)) ? "안" : "밖"} ${await focused(page)}`);
    }
    expect(walk.filter((step) => step.startsWith("밖")), `Tab 이 대화상자를 벗어났다:\n${walk.join("\n")}`).toEqual([]);

    // 고리가 닫혀 있으면 취소와 확인 둘 다 밟힌다. 취소가 DOM 에서 앞에
    // 있으므로 앞으로 가는 Tab 은 원래 나가는 방향이었다 — 감기지 않으면
    // 취소에는 Shift+Tab 으로만 닿는다.
    expect(walk.some((step) => step.includes("Cancel")), `취소에 닿지 못했다:\n${walk.join("\n")}`).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("section.ff-confirm")).toHaveCount(0);
    await expect
      .poll(async () => focused(page), { message: "닫은 뒤 포커스가 연 버튼으로 돌아와야 한다" })
      .toContain("Empty trash");
  });

  test("한 번도 Tab 을 누르지 않고 닫아도 body 로 떨어지지 않는다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });
    await taskInTrash(page, "물러날 할 일");

    await page.locator('button[aria-label="Empty trash"]').first().click();
    await expect(page.locator("section.ff-confirm")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("section.ff-confirm")).toHaveCount(0);

    // 이것이 고치기 전의 모습이었다: 대화상자가 사라진 자리에 포커스가
    // 남지 않았다.
    await expect.poll(async () => focused(page), { message: "포커스가 body 로 떨어졌다" }).not.toBe("body");
  });

  test("확정해서 연 버튼이 사라지면 §19.32 의 stable fallback 으로 간다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });
    await taskInTrash(page, "확정으로 사라질 할 일");

    await page.locator('button[aria-label="Empty trash"]').first().click();
    await page.locator("section.ff-confirm button.ff-btn-danger").click();

    // 휴지통이 비면 "Empty trash" 버튼도 같이 사라진다. 연 자리가 없어진
    // 경우가 이 검사의 전부이므로, 정말 없어졌는지 먼저 확인한다 —
    // 남아 있다면 이 검사는 위 검사와 같은 것을 재고 있는 셈이다.
    await expect(page.locator('button[aria-label="Empty trash"]'), "연 버튼이 사라져야 이 검사가 성립한다").toHaveCount(0);
    await expect.poll(async () => focused(page), { message: "갈 자리가 정해져 있어야 한다" }).toContain("main");
  });

  test("Modal 도 같은 규칙을 따른다 — 설정의 색 바꾸기", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });

    await page.locator(".global-rail button[aria-label='Settings']").click();
    // 접힌 `<details>` 안이다. 펴지 않으면 안의 것들은 레이아웃이 0 이라
    // 눌리지도 포커스를 받지도 않는다.
    await page.locator(".ff-settings-display > summary").click();
    const opener = page.locator(".ff-cat-recolor-btn").first();
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    await expect(page.locator("section.ff-modal")).toBeVisible();

    // `Modal` 은 `ConfirmModal` 과 달리 스스로 아무것도 잡지 않았다 —
    // 포커스가 밖에 서 있으면 표면의 keydown 이 울리지 않으므로 가둠이
    // 걸릴 기회 자체가 없었다. 그래서 여기서부터 잰다.
    expect(await focusInsideDialog(page), "열리면 포커스가 안으로 들어와야 한다").toBe(true);

    const walk: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      walk.push(`${(await focusInsideDialog(page)) ? "안" : "밖"} ${await focused(page)}`);
    }
    expect(walk.filter((step) => step.startsWith("밖")), `Tab 이 설정 페이지로 나갔다:\n${walk.join("\n")}`).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.locator("section.ff-modal")).toHaveCount(0);
    await expect
      .poll(async () => focused(page), { message: "연 버튼으로 돌아와야 한다" })
      .toContain("Change color");
  });

  test("자기 점검: 팝오버는 가두지 않는다 (§19.33)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openApp(page, { lists: [{ id: "l1", name: "목록" }] });

    // 위 네 검사가 "가두면 통과"라면, 전부 가둬 버리는 구현도 통과한다.
    // §19.33 은 반대를 요구한다 — 팝오버와 메뉴는 Tab 으로 자연스럽게
    // 빠져나갈 수 있어야 한다. 그 반대편을 같이 고정해 둔다.
    const field = await openQuickAdd(page);
    await field.fill("메뉴를 열 할 일");
    await field.press("Enter");
    await expect(page.getByText("메뉴를 열 할 일")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator('button.tm-task-menu[aria-label*="메뉴를 열 할 일"]').first().click();
    const menu = page.locator(".ff-context-menu-item").first();
    await expect(menu).toBeVisible();
    expect(
      await page.evaluate(() => !!document.querySelector("section[role=dialog]")),
      "행 메뉴는 대화상자가 아니다 — 대화상자였다면 이 검사가 재는 것이 달라진다",
    ).toBe(false);

    // 메뉴가 열린 채로 Tab 을 밟아 나갈 수 있어야 한다. 대화상자의 가둠이
    // 팝오버까지 번졌다면 여기가 먼저 무너진다.
    //
    // 포커스가 자리를 잡을 때까지 먼저 기다린다. 메뉴는 열린 뒤 한 박자
    // 늦게 첫 항목을 잡는데, 그 전에 Tab 을 누르면 메뉴가 방금 옮긴 포커스가
    // 우리가 누른 Tab 의 결과처럼 보인다 — 처음 쓴 판에서 실제로 한 번
    // 흔들렸고, 그때 읽힌 값은 "Tab 을 눌렀는데 그대로"였다.
    await expect
      .poll(async () => focused(page), { message: "메뉴가 첫 항목을 잡을 때까지" })
      .toContain("ff-context-menu-item");
    const before = await focused(page);
    await expect.poll(async () => focused(page), { message: "포커스가 멈출 때까지" }).toBe(before);

    await page.keyboard.press("Tab");
    await expect
      .poll(async () => focused(page), { message: "메뉴 안에서 Tab 이 제자리를 돌면 §19.33 위반이다" })
      .not.toBe(before);
  });
});
