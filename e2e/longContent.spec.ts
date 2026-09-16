import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const RUN = 220;
const UNBROKEN = "가".repeat(40) + "A".repeat(60) + "가".repeat(40);
const URLISH = "https://example.com/" + "segment-".repeat(18) + "end";
const SENTENCE = "이 작업은 아주 긴 제목을 가지고 있습니다. ".repeat(8);

const SEED = {
  folders: [{ id: "f-long", name: "폴".repeat(30) }],
  lists: [
    { id: "l-long", name: "리스트" + "이름".repeat(40), sidebarFolderId: "f-long" },
    { id: "l-short", name: "짧은 목록" },
  ],
  tasks: [
    { id: "t-unbroken", title: UNBROKEN, listId: "l-long" },
    { id: "t-url", title: URLISH, listId: "l-long" },
    { id: "t-sentence", title: SENTENCE, listId: "l-long" },
    { id: "t-run", title: "x".repeat(RUN), listId: "l-long", description: UNBROKEN + " " + URLISH },
    { id: "t-timed", title: UNBROKEN.slice(0, 80), listId: "l-long", startTime: "2026-08-18T09:00:00.000Z", endTime: "2026-08-18T10:30:00.000Z" },
  ],
};

/**
 * 세 가지 실패를 따로 잰다.
 *
 * ① 샘  — 제자리 흐름의 요소가 부모 밖으로 나간다. 레이아웃이 깨진 것이다.
 *         `position: absolute`/`fixed` 는 좌표로 놓는 것이라 "샌다"는 말이
 *         성립하지 않으므로 뺀다 (`.rail-tip` 이 그 예다 — 일부러 버튼 밖에
 *         `left: calc(100% + 8px)` 으로 앉는다).
 * ② 잘림 — 상자는 지켰는데 글자가 잘렸고 잘렸다는 표시가 없다. 말줄임표가 있으면
 *         읽는 사람이 "더 있다"를 안다. 없으면 문장이 조용히 끝난 것처럼 보인다.
 * 누를 것의 크기는 여기서 재지 않는다. `targetSize.spec.ts` 가 2.5.8 의 간격
 * 예외까지 구현해서 보고 있고, 그것 없이 24px 만 재면 같은 화면을 두고 저쪽은
 * 통과, 이쪽은 실패라고 말하게 된다 [실측 — 실제로 그랬다].
 *
 * ①만 보면 ②를 놓친다. 긴 이름을 넣었을 때 잘 만든 레이아웃일수록 ①은 안 나고
 * ②로 간다 — `overflow: hidden` 이 상자를 지켜주기 때문이다.
 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const name = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "");

    const spill: { sel: string; by: number; parent: string }[] = [];
    const clipped: { sel: string; by: number; text: string }[] = [];

    // 값싼 기하 검사를 먼저 하고, 걸린 것에만 `getComputedStyle` 을 묻는다.
    // 처음 판은 모든 요소에 스타일을 물어서 한 화면에 수십 초가 걸렸고, 검사가
    // 결함이 아니라 제한시간에 걸려 죽었다 [실측].
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // 화면에 걸치지 않는 것은 재지 않는다. 비용의 대부분이 거기 있었고, 보이지
      // 않는 자리의 넘침은 사람이 겪는 결함이 아니다.
      if (r.bottom < -200 || r.top > vh + 200 || r.right < -200 || r.left > vw + 200) continue;

      const p = el.parentElement;
      if (p) {
        const pr = p.getBoundingClientRect();
        const by = Math.round(Math.max(r.right - pr.right, pr.left - r.left));
        if (by > 1 && pr.width > 0) {
          const cs = getComputedStyle(el);
          // 좌표로 놓는 것은 "샌다"는 말이 성립하지 않는다 (`.rail-tip` 이 그렇다 —
          // 일부러 버튼 밖 `left: calc(100% + 8px)` 에 앉는다).
          if (cs.position !== "fixed" && cs.position !== "absolute") {
            const ps = getComputedStyle(p);
            const scrolls = /auto|scroll/.test(ps.overflowX) || /auto|scroll/.test(ps.overflow);
            if (!scrolls && ps.display !== "none") spill.push({ sel: name(el), by, parent: name(p) });
          }
        }
      }

      const over = el.scrollWidth - el.clientWidth;
      if (over > 1 && (el.textContent ?? "").trim()) {
        const cs = getComputedStyle(el);
        const hides = cs.overflowX === "hidden" || cs.overflow === "hidden";
        if (hides && cs.textOverflow !== "ellipsis") {
          clipped.push({ sel: name(el), by: over, text: (el.textContent ?? "").slice(0, 30) });
        }
      }
    }
    return { spill, clipped, doc: document.documentElement.scrollWidth - window.innerWidth };
  });
}

const fold = <T extends { sel: string }>(rows: T[], key: (r: T) => number) => {
  const m = new Map<string, T>();
  for (const r of rows) { const prev = m.get(r.sel); if (!prev || key(r) > key(prev)) m.set(r.sel, r); }
  return [...m.values()].sort((a, b) => key(b) - key(a));
};

test("긴 내용에서 무엇이 무너지는가", async ({ page }, testInfo) => {
  testInfo.setTimeout(testInfo.timeout * 6);
  await openApp(page, SEED);

  // 폭은 프로젝트가 정한다. playwright.config.ts 의 주석이 적어둔 그대로 —
  // 데스크톱·태블릿·폰은 "세 개의 렌더링 엔진이 아니라 세 개의 뷰포트"다.
  const width = page.viewportSize()?.width ?? 1440;
  const nav = width < 768 ? ".mobile-nav" : ".global-rail";
  const buttons = page.locator(`${nav} button`);
  const count = await buttons.count();

  // 이름이 아니라 순서로 돈다. 폰의 `.mobile-nav` 는 보이는 글자를 이름으로 쓰므로
  // `aria-label` 이 없고, 이름으로 찾으면 폰에서는 아무것도 못 찾은 채 매칭 안 되는
  // 로케이터의 대기만 반복하다 제한시간에 죽는다 [실측] — 그리고 그 전까지는
  // "통과"로 보인다. 0 이면 여기서 시끄럽게 실패하는 편이 낫다.
  expect(count, `${nav} 에서 갈 곳을 하나도 못 찾았다 — 이 검사는 아무것도 안 본 것이다`).toBeGreaterThan(0);

  const trouble: string[] = [];

  async function inspect(where: string) {
    await page.waitForTimeout(600);
    const m = await measure(page);
    if (!m.spill.length && !m.clipped.length && m.doc <= 0) return;
    const lines = [
      ...(m.doc > 0 ? [`        문서가 가로로 ${m.doc}px 넘친다`] : []),
      ...fold(m.spill, (x) => x.by).slice(0, 6).map((r) => `        샘   +${r.by}px  ${r.sel} (부모 ${r.parent})`),
      ...fold(m.clipped, (x) => x.by).slice(0, 8).map((r) => `        잘림 +${r.by}px  ${r.sel}  "${r.text}"`),
    ];
    trouble.push(`  ${width}px · ${where}\n${lines.join("\n")}`);
  }

  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press("Escape").catch(() => {});
    const btn = buttons.nth(i);
    const label = (await btn.getAttribute("aria-label")) ?? (await btn.innerText()).trim() ?? `#${i}`;
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 5000 }).catch(() => {});
    await inspect(label);
  }

  // 상세 서랍 — 긴 제목이 가장 크게 걸리는 자리이고, 막대가 데려가지 않는다.
  await page.keyboard.press("Escape").catch(() => {});
  await buttons.first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  const row = page.locator(".tm-task, .tm-row").first();
  if (await row.count()) {
    await row.click({ timeout: 5000 }).catch(() => {});
    await inspect("상세 서랍");
  }

  expect(trouble, `긴 이름이 들어오자 상자를 못 지킨 곳:\n${trouble.join("\n")}`).toEqual([]);
});

/**
 * 그물이 두 가지를 다 잡는지.
 *
 * 이 파일은 만들어지는 동안 세 번 "통과"했는데 세 번 다 아무것도 안 본 것이었다 —
 * 폰에서 갈 곳을 못 찾아 빈 목록을 돌았고, 매칭 안 되는 로케이터의 대기가 8분을
 * 먹었다. 통과와 침묵은 화면에 같은 모습으로 나온다.
 */
test("샘과 잘림을 둘 다 잡는다 — 그물의 자기 점검", async ({ page }) => {
  await openApp(page);

  const clean = await measure(page);
  expect(clean.spill, "심기 전에 이미 새고 있으면 아래 점검이 무엇을 잡았는지 알 수 없다").toEqual([]);

  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "probe-host";
    host.style.cssText = "position:relative;width:120px;margin:8px";
    // ① 샘 — 제자리 흐름의 자식이 부모보다 넓다.
    const wide = document.createElement("div");
    wide.style.cssText = "width:400px;height:12px;background:#eee";
    // ② 잘림 — 상자는 지켰는데 말줄임표가 없다.
    const cut = document.createElement("div");
    cut.style.cssText = "width:60px;overflow:hidden;white-space:nowrap";
    cut.textContent = "말줄임표 없이 조용히 끝나는 아주 긴 문장";
    host.append(wide, cut);
    document.body.append(host);
  });

  const planted = await measure(page);
  expect(planted.spill.length, "400px 자식을 120px 부모에 넣었는데 못 잡았다").toBeGreaterThan(0);
  expect(planted.clipped.length, "말줄임표 없는 잘림을 못 잡았다").toBeGreaterThan(0);

  await page.evaluate(() => document.getElementById("probe-host")?.remove());
  const after = await measure(page);
  expect({ spill: after.spill, clipped: after.clipped }, "표본을 걷으면 다시 깨끗해야 한다").toEqual({ spill: [], clipped: [] });
});
