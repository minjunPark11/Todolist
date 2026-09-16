import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/**
 * 폭을 훑으며 겹침과 화면 밖으로 밀린 것을 찾는다.
 *
 * `longContent.spec.ts` 가 이미 세 뷰포트에서 "상자를 지키는가"를 본다. 여기서
 * 보는 것은 다른 둘이다.
 *
 *   겹침   — 제자리 흐름의 컨트롤 둘이 서로를 덮는다. 덮개(팝오버·서랍)는
 *            일부러 덮는 것이므로 `absolute`/`fixed` 는 뺀다. 남는 겹침은
 *            좁아진 열에서 두 컨트롤이 같은 자리를 차지한 것이고, 뒤에 깔린
 *            쪽은 누를 수 없다.
 *   밀림   — 컨트롤이 뷰포트 밖으로 나갔다. 문서의 `scrollWidth` 로는 안 보이는
 *            경우가 있다 — 왼쪽으로(음수 좌표) 밀린 것은 스크롤 폭을 늘리지
 *            않는다.
 *
 * 폭은 이 파일이 직접 돈다. 그래서 프로젝트(뷰포트)마다 또 도는 것은 같은 일을
 * 세 번 하는 것이라, 데스크톱 한 번만 돈다.
 */

/** §19.5 가 아니라 01-base.css 의 `--bp-*` 사다리와 그 짝, 그리고 양 끝. */
const WIDTHS = [320, 360, 390, 430, 520, 600, 639, 640, 700, 767, 768, 820, 899, 900, 901, 1023, 1024, 1119, 1120, 1239, 1240, 1440, 1728];

interface Trouble {
  overlap: { a: string; b: string; w: number; h: number }[];
  offscreen: { sel: string; by: number; side: string }[];
}

async function measure(page: Page): Promise<Trouble> {
  return page.evaluate(() => {
    const name = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "");

    const PRESSABLE = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=radio]";
    const vw = window.innerWidth;

    /**
     * 조상이 잘라내고 남은 부분.
     *
     * 스크롤하는 조상 안에서 밖으로 나간 요소는 화면에 없다. 좌표로만 보면 그
     * 아래 있는 것과 "겹쳐" 보이는데 사람은 그런 겹침을 겪지 않는다 — 캘린더
     * 사이드바(768~1023px 에서 398 보임 / 456 내용)의 미니 달력 마지막 줄이
     * 그렇게 잡혔다 [실측]. 스크롤하면 나오는 것이지 잃은 것이 아니다.
     */
    const visibleBox = (el: Element): DOMRect | null => {
      let box = el.getBoundingClientRect();
      let left = box.left, top = box.top, right = box.right, bottom = box.bottom;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const pr = n.getBoundingClientRect();
        left = Math.max(left, pr.left);
        top = Math.max(top, pr.top);
        right = Math.min(right, pr.right);
        bottom = Math.min(bottom, pr.bottom);
        if (right - left < 1 || bottom - top < 1) return null;
      }
      return new DOMRect(left, top, right - left, bottom - top);
    };

    const inFlow: { el: Element; r: DOMRect }[] = [];
    const offscreen: { sel: string; by: number; side: string }[] = [];

    for (const el of document.querySelectorAll(PRESSABLE)) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      const full = el.getBoundingClientRect();
      if (full.width < 1 || full.height < 1) continue;
      // 세로로 화면 밖인 것은 스크롤하면 나오는 것이라 여기서 볼 일이 아니다.
      if (full.bottom < 0 || full.top > window.innerHeight) continue;
      const r = visibleBox(el);
      if (!r) continue;

      if (r.left < -1) offscreen.push({ sel: name(el), by: Math.round(-r.left), side: "왼쪽" });
      else if (r.right > vw + 1) offscreen.push({ sel: name(el), by: Math.round(r.right - vw), side: "오른쪽" });

      // 흐름 밖인지는 **조상까지** 봐야 한다. 처음 판은 요소 자신의 `position` 만
      // 봤고, 그래서 `position: fixed` 인 폰 하단 막대 안의 `static` 버튼들이
      // 제자리 흐름으로 세어져 모든 페이지 내용과 "겹친다"고 보고했다 [실측 —
      // 141 조합 중 수십 개가 그 오탐이었다]. 고정 막대는 덮으라고 있는 것이다.
      let out = false;
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const p = getComputedStyle(n).position;
        if (p === "fixed" || p === "sticky" || p === "absolute") { out = true; break; }
      }
      if (!out) inFlow.push({ el, r });
    }

    // 겹침: 제자리 흐름의 컨트롤끼리만, 그리고 조상-자손 관계가 아닌 것끼리만.
    const overlap: { a: string; b: string; w: number; h: number }[] = [];
    for (let i = 0; i < inFlow.length; i += 1) {
      for (let j = i + 1; j < inFlow.length; j += 1) {
        const A = inFlow[i];
        const B = inFlow[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
        const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (w > 4 && h > 4) overlap.push({ a: name(A.el), b: name(B.el), w: Math.round(w), h: Math.round(h) });
      }
    }
    return { overlap, offscreen };
  });
}

function fold<T>(rows: T[], key: (r: T) => string, size: (r: T) => number): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const prev = m.get(key(r));
    if (!prev || size(r) > size(prev)) m.set(key(r), r);
  }
  return [...m.values()].sort((a, b) => size(b) - size(a));
}

test("폭을 훑어 겹치거나 밀린 컨트롤을 찾는다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "폭은 이 파일이 직접 돈다 — 프로젝트마다 또 돌 일이 아니다");
  testInfo.setTimeout(testInfo.timeout * 20);

  await openApp(page, {
    lists: [{ id: "l1", name: "설계 검토" }],
    tasks: [
      { id: "t1", title: "첫 번째 할 일", listId: "l1" },
      { id: "t2", title: "두 번째 할 일", listId: "l1", dueDate: "2026-08-20" },
    ],
  });

  const trouble: string[] = [];
  let looked = 0;

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(350);

    const nav = width < 768 ? ".mobile-nav" : ".global-rail";
    const buttons = page.locator(`${nav} button`);
    const count = await buttons.count();
    expect(count, `${width}px 에서 ${nav} 가 갈 곳을 하나도 안 준다 — 이 폭은 검사되지 않는다`).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      await page.keyboard.press("Escape").catch(() => {});
      const btn = buttons.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      const label = (await btn.getAttribute("aria-label")) ?? (await btn.innerText().catch(() => "")) ?? `#${i}`;
      await btn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(450);
      looked += 1;

      const m = await measure(page);
      if (!m.overlap.length && !m.offscreen.length) continue;
      const lines = [
        ...fold(m.overlap, (r) => `${r.a}|${r.b}`, (r) => r.w * r.h).slice(0, 4)
          .map((r) => `        겹침 ${r.w}x${r.h}  ${r.a}  ↔  ${r.b}`),
        ...fold(m.offscreen, (r) => r.sel + r.side, (r) => r.by).slice(0, 4)
          .map((r) => `        밀림 ${r.side} ${r.by}px  ${r.sel}`),
      ];
      trouble.push(`  ${width}px · ${label.trim()}\n${lines.join("\n")}`);
    }
  }

  console.log(`훑은 조합: ${looked}`);
  expect(looked, "한 화면도 못 본 스윕은 통과가 아니다").toBeGreaterThan(WIDTHS.length);
  expect(trouble, `겹치거나 밀린 컨트롤:\n${trouble.join("\n")}`).toEqual([]);
});

/**
 * 그물이 겹침과 밀림을 잡는지.
 *
 * 이 파일은 만들어지는 동안 세 번 오탐을 냈고 세 번 다 "겹쳤다"고 말했다.
 *
 *   ① `position: fixed` 인 폰 하단 막대 **안의** `static` 버튼들을 제자리
 *      흐름으로 셌다. 고정 막대는 덮으라고 있는 것이다.
 *   ② 스크롤하는 조상 안에서 밖으로 나간 요소를 좌표로만 봤다. 캘린더
 *      사이드바(768~1023px 에서 398 보임 / 456 내용)의 미니 달력 마지막 줄이
 *      그렇게 잡혔다 — 스크롤하면 나온다.
 *   ③ 고정 하단 막대는 **어느 스크롤 위치에서든** 그 순간의 아래 54px 을
 *      덮는다. 스크롤 0 에서 재면 스크롤하는 페이지는 전부 "가려진" 것으로
 *      보인다. 옳은 질문은 "끝까지 스크롤했을 때 마지막 내용이 막대를
 *      벗어나는가"이고, 그렇게 재니 어느 화면도 가려지지 않았다.
 *
 * 세 번 다 고쳤지만, 고친 뒤에 남은 통과가 진짜인지는 심어보기 전에는 모른다.
 */
test("겹침과 밀림을 잡는다 — 그물의 자기 점검", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "본 검사와 같은 프로젝트에서만 돈다");
  await openApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  expect((await measure(page)).overlap, "심기 전에 이미 겹치고 있으면 아래 점검이 무엇을 잡았는지 알 수 없다").toEqual([]);

  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "sweep-probe";
    host.style.cssText = "position:relative;height:0";
    // 겹침 — 제자리 흐름의 두 컨트롤이 같은 자리를 차지한다.
    const a = document.createElement("button");
    a.textContent = "아래";
    a.style.cssText = "position:relative;display:block;width:120px;height:40px";
    const b = document.createElement("button");
    b.textContent = "위";
    b.style.cssText = "position:relative;display:block;width:120px;height:40px;margin-top:-30px";
    // 밀림 — 컨트롤이 뷰포트 오른쪽 밖으로.
    const c = document.createElement("button");
    c.textContent = "밖";
    c.style.cssText = "position:relative;display:block;width:120px;height:20px;margin-left:calc(100vw - 20px)";
    host.append(a, b, c);
    document.body.prepend(host);
  });

  const planted = await measure(page);
  expect(planted.overlap.length, "30px 겹쳐 놓은 버튼 둘을 못 잡았다").toBeGreaterThan(0);
  expect(planted.offscreen.length, "뷰포트 밖으로 100px 밀어낸 버튼을 못 잡았다").toBeGreaterThan(0);

  await page.evaluate(() => document.getElementById("sweep-probe")?.remove());
  expect(await measure(page), "표본을 걷으면 다시 깨끗해야 한다").toEqual({ overlap: [], offscreen: [] });
});
