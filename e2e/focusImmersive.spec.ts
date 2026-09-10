// 몰입 모드와 기록 뷰가 화면에서 실제로 어떻게 그려지는지 (24-focus.css).
//
// `src/styles/focusImmersiveTokens.test.ts` 가 몰입의 토큰 목록에 **빠진 이름**을
// 잡고, 이 스펙은 그 목록의 **값이 맞는지**를 잰다. 둘은 중복이 아니다 — grep 은
// 어떤 규칙이 실제로 이겼는지 못 보고, 대비는 계산해야 나온다.
//
// 잡으려는 것은 셋이다. 셋 다 라이트/다크 중 한쪽에서만 났거나, 배경이 없어서
// 눈에 띄지 않던 것들이다.
//
//   ① 몰입의 시계가 카드 위에서 흰색으로 남아 대비 1.09 (라이트에서만)
//   ② 주 버튼의 흰 글자가 액센트 면 위에서 3.65 (다크에서만)
//   ③ 기록 뷰가 가운데 정렬이라 전폭인 머리글과 왼쪽 선이 어긋남 (두 테마 모두)
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

/** WCAG 대비. 두 색 다 불투명한 곳에서만 부른다. */
function contrast(a: string, b: string): number {
  const luminance = (color: string): number => {
    const [r, g, b2] = color.match(/[\d.]+/g)!.map(Number);
    const channel = (value: number): number => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b2);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

/**
 * 요소의 글자색과, 그 뒤에서 실제로 칠해진 배경색.
 *
 * 자기 배경이 투명한 요소는 조상의 것을 보여주므로, 불투명한 배경이 나올 때까지
 * 위로 걸어 올라간다. `surfaceHierarchy.spec.ts` 가 같은 이유로 같은 걸음을 걷는다.
 */
async function inkOn(page: Page, selector: string): Promise<{ color: string; bg: string }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel as string) as HTMLElement;
    if (!el) throw new Error(`${sel} 이 화면에 없다`);
    let node: HTMLElement | null = el;
    let bg = getComputedStyle(el).backgroundColor;
    while (node && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
      node = node.parentElement;
      if (node) bg = getComputedStyle(node).backgroundColor;
    }
    return { color: getComputedStyle(el).color, bg };
  }, selector);
}

// 카드는 901 위에서만 그려지고(§14), 몰입의 회귀도 그 카드 위에서 났다.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 901, "카드는 901 위에서만 그려진다");

for (const theme of ["light", "dark"] as const) {
  test(`몰입에서 시계와 주 버튼이 읽힌다 — ${theme}`, async ({ page }) => {
    await openApp(page, { theme });
    await page.goto("/focus");
    await expect(page.getByRole("button", { name: "Start focus", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Immersive view", exact: true }).click();
    await expect(page.locator(".focus-immersive")).toBeVisible();

    // ① 96px 이지만 large text 의 3:1 이 아니라 본문 기준으로 잰다. 이 화면에서
    //    시계는 장식이 아니라 사람이 읽으러 온 유일한 값이다.
    const clock = await inkOn(page, ".focus-time");
    expect(
      contrast(clock.color, clock.bg),
      `몰입의 시계 ${clock.color} on ${clock.bg}`,
    ).toBeGreaterThanOrEqual(4.5);

    const muted = await inkOn(page, ".focus-muted");
    expect(
      contrast(muted.color, muted.bg),
      `몰입의 보조 문구 ${muted.color} on ${muted.bg}`,
    ).toBeGreaterThanOrEqual(4.5);

    // ② 몰입에서도 면은 면이다.
    const primary = await inkOn(page, ".focus-primary");
    expect(
      contrast(primary.color, primary.bg),
      `몰입의 주 버튼 ${primary.color} on ${primary.bg}`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  test(`주 버튼의 면이 흰 글자를 견딘다 — ${theme}`, async ({ page }) => {
    await openApp(page, { theme });
    await page.goto("/focus");
    await expect(page.getByRole("button", { name: "Start focus", exact: true })).toBeVisible();

    // 18px/600 은 WCAG 의 large text(18.66px bold)가 아니므로 기준은 4.5 다.
    const primary = await inkOn(page, ".focus-primary");
    expect(
      contrast(primary.color, primary.bg),
      `주 버튼 ${primary.color} on ${primary.bg}`,
    ).toBeGreaterThanOrEqual(4.5);

    // 선택된 탭은 파랑 채움을 쓰지 않는다 — 그 자리는 주 버튼 하나의 것이다(§7.1).
    // 그래도 13px 이므로 자기 면 위에서 읽히는지는 같은 기준으로 잰다.
    const selected = await inkOn(page, '.focus-tabs button[aria-selected="true"]');
    expect(
      contrast(selected.color, selected.bg),
      `선택된 탭 ${selected.color} on ${selected.bg}`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  test(`기록 뷰가 머리글과 같은 왼쪽 선에 선다 — ${theme}`, async ({ page }) => {
    await openApp(page, { theme });
    await page.goto("/focus");
    await page.getByRole("tab", { name: "Records", exact: true }).click();
    await expect(page.locator(".focus-records")).toBeVisible();

    const edges = await page.evaluate(() => {
      const left = (sel: string) =>
        Math.round(document.querySelector(sel)!.getBoundingClientRect().left);
      return { heading: left(".focus-page-header h1"), records: left(".focus-records") };
    });
    // 한 페이지에 격자는 하나다. 머리글이 전폭이면 아래도 전폭이다.
    expect(edges.records, `머리글 ${edges.heading} · 기록 ${edges.records}`).toBe(edges.heading);
  });
}
