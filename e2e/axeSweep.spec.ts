// jsdom 이 못 보는 것을 브라우저에서 본다 (Gate 11 의 나머지 절반).
//
// `src/components/tasks/a11y.test.tsx` 와 `src/components/shell/a11y.test.tsx` 가
// 이미 axe 를 돌린다. 그 둘의 머리주석이 자기 한계를 정확히 적어뒀다:
//
//   "jsdom computes no layout and paints nothing, so `color-contrast` is off
//    here (it has no pixels to sample) and anything about focus order under a
//    real compositor is still a human check."
//
// 이 파일이 그 한계 너머다. 진짜 브라우저이므로 `color-contrast` 를 켠다. 그리고
// 덮는 범위가 다르다 — jsdom 쪽은 Tasks 모듈과 셸을 각각 마운트해서 보는데,
// 여기서는 앱을 실제로 띄우고 레일이 데려가는 모든 화면을 돈다. Calendar ·
// Focus · Matrix · Settings · Search · Notifications 는 axe 를 받은 적이 없었다.
//
// 처음 돌렸을 때 나온 것 (전부 serious):
//
//   color-contrast              9곳  키캡 · 매트릭스 IV 로마자 · 카테고리 배지 ·
//                                    현재시각 알약
//   nested-interactive          4곳  `.gcal-cat-row` 가 `role="button"` 인데 그
//                                    안에 체크박스·메뉴·팔레트가 들어 있었다
//   scrollable-region-focusable 3곳  시간 격자를 키보드로 스크롤할 수 없었다
//
// 대비 실패 아홉이 전부 3.92~4.42 였다는 것이 이 파일의 존재 이유를 말해준다.
// `src/styles/contrast.test.ts` 는 토큰 쌍을 재는데, 그 표의 머리주석이 "캔버스는
// 넷뿐이다"라고 열거한다 — 맞는 말이지만 글자가 앉는 면이 캔버스만은 아니다.
// 호버 틴트, 배지의 알약, 사분면의 16% 채움, 알약의 색 혼합 위에서는 같은 잉크가
// 다른 숫자를 낸다. 그것을 재려면 픽셀이 필요하고, 픽셀은 여기에만 있다.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

interface Violation {
  id: string;
  impact: string;
  nodes: string[];
}

/**
 * jsdom 쪽과 같은 문턱: serious 와 critical 만 깬다.
 *
 * 그 아래(moderate·minor)를 무시하는 것이 아니라, 두 파일이 같은 자를 쓰지 않으면
 * 한쪽을 통과한 변경이 다른 쪽에서 막히는 일이 생기기 때문이다.
 */
function blocking(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

async function audit(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ content: AXE });
  const found = await page.evaluate(async () => {
    // `region` 은 여기서 켠 채로 둔다 — 모듈 하나가 아니라 셸까지 다 있는
    // 화면이므로 "모든 것이 랜드마크 안에 있는가"를 물을 수 있다.
    const results = await (window as unknown as { axe: { run: (n: Document) => Promise<{ violations: { id: string; impact: string; nodes: { html: string; target: string[] }[] }[] }> } }).axe.run(document);
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} | ${n.html.slice(0, 110)}`),
    }));
  });
  return blocking(found);
}

/** 이 너비에서 화면을 바꾸는 막대. 폰에서는 레일이 숨고 `.mobile-nav` 가 그 자리다. */
function navFor(width: number): string {
  return width < 768 ? ".mobile-nav" : ".global-rail";
}

async function destinations(page: Page, nav: string): Promise<string[]> {
  return page.$$eval(`${nav} button`, (els) =>
    els.map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "").filter(Boolean),
  );
}

/**
 * 한 화면으로 가고, **갔는지 확인한다**.
 *
 * 처음 쓴 판은 클릭 실패를 삼켰다. 그러면 Search 가 연 명령 메뉴의 뒷막이 다음
 * 클릭을 막았을 때 조용히 이전 화면에 머무르고, 검사는 같은 화면을 두 번 재면서
 * 통과했다고 말한다 [실측 — 데스크톱의 Notifications 와 Settings 가 그렇게
 * 건너뛰어졌다]. 아무것도 안 본 검사가 통과하는 것이 가장 나쁘다.
 *
 * 그래서 두 가지를 한다. 가기 전에 Escape 로 떠 있는 것을 걷고, 간 뒤에
 * `aria-current` 로 정말 그 화면인지 묻는다. Search 처럼 화면이 아니라 대화상자를
 * 여는 항목은 `aria-expanded` 로 열린 것을 확인한다.
 */
async function goTo(page: Page, nav: string, name: string): Promise<void> {
  // 앞 화면이 남긴 덮개를 걷는다 — 명령 메뉴의 뒷막이 다음 클릭을 가로챈다.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  const item = page.locator(`${nav} button[aria-label="${name}"]`).first();
  const target = (await item.count()) ? item : page.locator(`${nav} button`).filter({ hasText: name }).first();
  await target.click();
  await page.waitForTimeout(700);

  const state = await target.evaluate((el) => ({
    current: el.getAttribute("aria-current"),
    expanded: el.getAttribute("aria-expanded"),
    popup: el.getAttribute("aria-haspopup"),
  }));
  const opensDialog = state.popup !== null;
  const arrived = opensDialog ? state.expanded === "true" : state.current !== null;
  expect(arrived, `${name} 을 눌렀는데 그 화면에 가지 못했다 — 검사가 이전 화면을 다시 재게 된다`).toBe(true);
}

function report(where: string, violations: Violation[]): string {
  return violations
    .map((v) => `  ${where} · ${v.impact} · ${v.id}\n${v.nodes.map((n) => `      ${n}`).join("\n")}`)
    .join("\n");
}

for (const theme of ["light", "dark"] as const) {
  test(`레일이 데려가는 모든 화면에 serious 이상이 없다 — ${theme}`, async ({ page }, testInfo) => {
    // 이 스윕은 화면을 하나씩 돌아야 해서 기본 제한시간으로는 모자라다.
    testInfo.setTimeout(testInfo.timeout * 3);

    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    await page.waitForTimeout(1200);
    if (theme === "dark") {
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.waitForTimeout(300);
    }

    const nav = navFor(page.viewportSize()?.width ?? 1440);
    const dests = await destinations(page, nav);
    expect(dests.length, "막대가 화면을 하나도 안 데려가면 이 검사는 아무것도 안 본 것이다").toBeGreaterThan(0);

    const failures: string[] = [];
    for (const dest of dests) {
      await goTo(page, nav, dest);
      const violations = await audit(page);
      if (violations.length) failures.push(report(dest, violations));
    }

    expect(
      failures,
      `axe 가 serious 이상을 찾았다 (${theme}, ${dests.length}개 화면):\n${failures.join("\n")}`,
    ).toEqual([]);
  });
}

/**
 * 그물이 실제로 걷고 있는지.
 *
 * "위반 0"과 "아무것도 안 봤다"는 화면에 같은 모습으로 나온다. 실제로 이 파일의
 * 첫 판이 그 둘을 헷갈렸다 — 클릭 실패를 삼켜서 데스크톱의 두 화면을 건너뛰고도
 * 통과했다. 그래서 잡히는 것을 하나 심어 잡히는지 본다.
 */
test("보이는 것을 잡는다 — 그물의 자기 점검", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const probe = document.createElement("p");
    probe.id = "axe-probe";
    // 흰 바탕의 아주 옅은 회색 — 1.5:1 언저리라 axe 가 serious 로 잡는다.
    probe.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9;background:#ffffff;color:#eeeeee;font-size:12px";
    probe.textContent = "낮은 대비 표본";
    document.body.appendChild(probe);
  });

  const withProbe = await audit(page);
  expect(
    withProbe.some((v) => v.id === "color-contrast"),
    "일부러 심은 1.5:1 글자를 못 잡았다면, 통과는 검사가 아니라 침묵이다",
  ).toBe(true);

  await page.evaluate(() => document.getElementById("axe-probe")?.remove());
  expect(await audit(page), "표본을 걷으면 다시 깨끗해야 한다").toEqual([]);
});
