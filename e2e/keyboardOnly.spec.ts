import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/**
 * 마우스 없이 끝까지 갈 수 있는가.
 *
 * `focusObscured.spec.ts` 는 Tab 으로 걸으며 **가려지는가**를 본다(2.4.11).
 * 여기서 보는 것은 그 앞의 질문 둘이다: 탭이 **닿기는 하는가**, 그리고 닿은
 * 것으로 **일을 끝낼 수 있는가**.
 *
 * `axeSweep.spec.ts` 와 경계가 갈린다. 저쪽은 "탭 가능**해야 하는데** 그렇다고
 * 말하지 않는 것"을 본다 — 캘린더의 시간 격자가 `tabIndex` 없이 스크롤만 하던
 * 자리가 그쪽의 `scrollable-region-focusable` 에 걸렸다. 이 파일은 그 반대편,
 * "탭 가능하다고 **말한** 것이 실제로 닿고 쓸 수 있는가"를 본다.
 *
 * 둘을 섞으면 안 된다는 것은 확인했다: 시간 격자의 `tabIndex={0}` 을 빼고
 * 돌렸더니 이 파일은 넷 다 통과하고(뺀 요소는 셀 목록에서도 빠지므로) 저쪽이
 * 잡았다 [실측]. 한쪽만 있으면 그 사이가 빈다.
 *
 * 데스크톱 프로젝트에서만 돈다. 키보드만 쓰는 사람은 키보드가 달린 기기에
 * 있고, 폰의 `.mobile-nav` 는 다섯 칸짜리 다른 셸이다 — 같은 걸음을 세 번
 * 반복하는 대신 한 번 제대로 걷는다.
 */

interface Expected {
  id: string;
  sel: string;
  name: string;
}

/**
 * 탭 순서에 **있어야 하는** 것들에 표를 붙인다.
 *
 * `tabindex="-1"` 은 뺀다 — 로빙 탭인덱스처럼 방향키로 도는 자리는 일부러
 * 순서 밖에 두는 것이고, 그것까지 세면 올바른 패턴을 결함이라 부르게 된다.
 */
async function markTabbable(page: Page): Promise<Expected[]> {
  return page.evaluate(() => {
    const SEL =
      "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [tabindex]";
    let i = 0;
    const expected: { id: string; sel: string; name: string }[] = [];
    for (const el of document.querySelectorAll(SEL)) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;
      if (el.getAttribute("tabindex") === "-1") continue;
      if (el.closest("[inert]") || el.getAttribute("aria-hidden") === "true") continue;
      // 닫힌 `<details>` 안은 탭 순서 밖이다 — summary 에서 Enter 로 열고 들어가는
      // 것이 그 요소의 계약이다. Chrome 은 닫힌 상태에서도 속에 레이아웃을 주므로
      // 크기로만 거르면 올바른 패턴을 결함이라 부르게 된다 [실측 — 설정의 "Timer
      // display"·"Calendar display" 안의 넷이 그렇게 잡혔다].
      const details = el.closest("details");
      if (details && !details.open && el.tagName !== "SUMMARY") continue;
      const id = `kb-${i++}`;
      el.setAttribute("data-kb", id);
      expected.push({
        id,
        sel: el.tagName.toLowerCase() + "." + (el.className || "").toString().split(/\s+/).slice(0, 2).join("."),
        name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30),
      });
    }
    return expected;
  });
}

/**
 * 한 바퀴만 걷는다.
 *
 * 처음 판은 정해진 횟수만큼 Tab 을 눌렀는데, 포커스 덫 안에서 아흔 번을 누르자
 * 포커스가 페이지 밖(브라우저 크롬)으로 나갔고 그 뒤의 Escape 가 앱에 닿지
 * 않았다 — 그래서 "Escape 가 대화상자를 못 닫는다"는 없는 결함을 봤다 [실측].
 * 처음 밟은 곳으로 돌아오면 멈춘다.
 */
async function walkOnce(page: Page, limit: number): Promise<Set<string>> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  const reached = new Set<string>();
  let first = "";
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.getAttribute?.("data-kb") ?? "");
    if (!id) continue;
    if (!first) first = id;
    else if (id === first && reached.size > 1) break;
    reached.add(id);
  }
  return reached;
}

test("탭이 화면의 모든 컨트롤에 닿는다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "키보드만 쓰는 사람은 키보드가 달린 기기에 있다");
  testInfo.setTimeout(testInfo.timeout * 6);

  await openApp(page, {
    lists: [{ id: "l1", name: "목록" }],
    tasks: [{ id: "t1", title: "키보드로 처리할 일", listId: "l1" }],
  });

  // 덮개를 여는 항목(검색·알림)은 포커스 덫이 정답이므로 여기서 걷지 않는다.
  // 덫 안에서 바깥이 안 닿는 것은 결함이 아니라 계약이다.
  const pages = await page.$$eval(".global-rail button", (els) =>
    els.filter((el) => el.getAttribute("aria-haspopup") === null).map((el) => el.getAttribute("aria-label") ?? ""),
  );
  expect(pages.length, "레일이 화면을 하나도 안 준다 — 이 검사는 아무것도 안 본 것이다").toBeGreaterThan(2);

  const unreached: string[] = [];
  for (const name of pages) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator(`.global-rail button[aria-label="${name}"]`).first().click({ timeout: 5000 });
    await page.waitForTimeout(700);

    const expected = await markTabbable(page);
    expect(expected.length, `${name} 에서 탭 대상을 하나도 못 찾았다`).toBeGreaterThan(0);

    const reached = await walkOnce(page, expected.length * 2 + 20);
    const missed = expected.filter((e) => !reached.has(e.id));
    if (missed.length) {
      unreached.push(`  ${name} — ${missed.length}/${expected.length}\n${missed.slice(0, 8).map((m) => `      ${m.sel}  "${m.name}"`).join("\n")}`);
    }
  }

  expect(
    unreached,
    `탭으로 닿지 않는 컨트롤이 있다 — 마우스 없이는 쓸 수 없는 자리다:\n${unreached.join("\n")}`,
  ).toEqual([]);
});

test("검색은 키보드로 열고 키보드로 빠져나온다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "같은 이유");
  await openApp(page);

  await page.keyboard.press("Control+k");
  await expect(page.locator(".cmd-menu-backdrop")).toBeVisible();
  await expect(page.locator(".cmd-menu-input"), "열자마자 글자를 칠 수 있어야 한다").toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator(".cmd-menu-backdrop"), "Escape 로 못 나오면 마우스를 찾아야 한다").toHaveCount(0);
});

test("키캡이 약속한 단축키가 실제로 그 일을 한다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "같은 이유");
  await openApp(page, { lists: [{ id: "l1", name: "목록" }] });

  // 트리거에 인쇄된 글자가 약속이다 (TaskQuickAdd.tsx §2.7 의 주석이 그렇게 부른다).
  const cap = page.locator(".tm-quickadd-key");
  await expect(cap).toHaveText(/⌘N|Ctrl\+N/);

  await page.keyboard.press("Control+n");
  await expect(page.locator(".tm-quickadd-title"), "약속한 단축키가 아무것도 열지 않는다").toBeFocused();
});

test("마우스 없이 할 일을 만들고 끝낸다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "같은 이유");
  testInfo.setTimeout(testInfo.timeout * 2);
  await openApp(page, { lists: [{ id: "l1", name: "목록" }] });

  const TITLE = "마우스 없이 만든 할 일";
  await page.keyboard.press("Control+n");
  await expect(page.locator(".tm-quickadd-title")).toBeFocused();
  await page.keyboard.type(TITLE);
  await page.keyboard.press("Enter");
  await expect(page.getByText(TITLE)).toBeVisible();
  await page.keyboard.press("Escape");

  // 탭으로 그 행의 체크박스까지 간다.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  let pressed = false;
  for (let step = 0; step < 40 && !pressed; step += 1) {
    await page.keyboard.press("Tab");
    const onCheckbox = await page.evaluate((title) => {
      const el = document.activeElement;
      if (!el) return false;
      const isCheck = el.getAttribute("role") === "checkbox" || (el.tagName === "INPUT" && el.getAttribute("type") === "checkbox");
      return isCheck && (el.getAttribute("aria-label") ?? "").includes(title);
    }, TITLE);
    if (onCheckbox) {
      await page.keyboard.press("Space");
      pressed = true;
    }
  }
  expect(pressed, "탭으로 그 행의 체크박스에 닿지 못했다").toBe(true);

  await expect
    .poll(
      async () =>
        page.evaluate((title) => {
          const raw = localStorage.getItem("focusflow.appData.v1");
          if (!raw) return "";
          return (JSON.parse(raw).tasks ?? []).find((t: { title: string }) => t.title === title)?.status ?? "";
        }, TITLE),
      { message: "Space 를 눌렀는데 저장된 상태가 바뀌지 않았다" },
    )
    .toBe("completed");
});
