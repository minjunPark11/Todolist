import { expect, test, type Page } from "@playwright/test";
import { openApp, openQuickAdd } from "./addList.helpers";

/**
 * 라이트의 면이 다크에 남아 있지 않은가.
 *
 * `src/styles/focusImmersiveTokens.test.ts` 가 몰입 화면 하나에 대해 이 질문을
 * 한다 — "페이지가 쓰는 토큰을 하나도 빠뜨리지 않고 다시 칠하는가". 그 파일이
 * 기록한 사고가 이 검사의 이유다: §14 가 카드에 `--bg-surface-muted` 를 주었는데
 * 몰입 목록에 그것이 없어서, 라이트의 몰입에서 카드가 #f5f5f7 로 남고 그 위에
 * 흰 시계가 얹혔다.
 *
 * 그 질문을 나머지 화면에 던진다. 그리고 재는 방법이 다르다 — 저쪽은 CSS 의
 * 이름을 세고, 여기서는 **실제로 칠해진 색**을 센다. 대비 검사(`axeSweep`)와도
 * 다르다: 라이트 값이 새어나왔는데 그 위의 글자도 같이 새어나오면 대비는 우연히
 * 통과한다. 흰 카드가 어두운 앱 한가운데 있어도 axe 는 조용하다.
 *
 * 재보니 새어나온 자리는 없었다 [실측 — 레일의 일곱 화면과 상세 서랍 · 행 메뉴 ·
 * 명령 메뉴 · 확인 대화상자 · 캘린더 팝오버까지, 다크 면 38종]. 그래서 고치는
 * 쪽이 아니라 고정하는 쪽이다.
 */

/** 밝다고 볼 경계. 이보다 밝은 면이 다크에 있으면 라이트에서 넘어온 것이다. */
const BRIGHT = 170;

function luminance(key: string): number {
  const [r, g, b] = key.split(",").map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 화면에 실제로 칠해진 불투명한 면 색들.
 *
 * 반투명(알파 < 0.9)은 아래 면에 얹히는 것이라 그 자체로는 테마를 말하지
 * 않는다. 작은 조각(24x12 미만)도 뺀다 — 점과 선은 면이 아니다.
 */
/**
 * 칠이 멎을 때까지 기다린다.
 *
 * 배경에 전이가 걸린 면이 있다 — `.context-sidebar-fold` 는
 * `transition: background var(--motion-row)` 를 갖는다. 테마가 붙는 순간
 * 그 버튼은 라이트의 면에서 다크의 면으로 **건너가며**, 그 사이의 중간색은
 * 둘 중 어느 테마의 색도 아니다. 그 중간을 재면 "다크에 밝은 면이 있다"고
 * 읽힌다.
 *
 * 실제로 그렇게 읽혔다: `--repeat-each=8` 로 3 번 실패했고, 잡힌 것은 언제나
 * `rgb(226,226,227) button.context-sidebar-fold` 하나였다 [실측]. 앱의
 * 결함이 아니라 이 그물이 셔터를 너무 일찍 누른 것이다.
 *
 * 전이만 기다린다. 애니메이션 전부를 기다리면 끝나지 않는 것(도는 스피너)에
 * 걸려 매 호출마다 만료를 기다리게 된다.
 */
async function settle(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => !document.getAnimations().some((a) => a.constructor.name === "CSSTransition" && a.playState === "running"),
      null,
      { timeout: 2000 },
    )
    // 멎지 않는 전이가 있다면 그것 자체가 다른 검사의 일이다. 여기서는
    // 기다릴 만큼 기다리고 찍는다.
    .catch(() => {});
}

async function surfaces(page: Page): Promise<Map<string, string>> {
  await settle(page);
  const rows = await page.evaluate(() => {
    const seen = new Map<string, string>();
    for (const el of document.querySelectorAll("body *")) {
      const box = el.getBoundingClientRect();
      if (box.width < 24 || box.height < 12 || box.bottom < 0 || box.top > window.innerHeight) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      if (!m) continue;
      const parts = m[1].split(",").map((x) => x.trim());
      if (Number(parts[3] ?? "1") < 0.9) continue;
      const key = parts.slice(0, 3).join(",");
      if (!seen.has(key)) seen.set(key, `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(/\s+/)[0]}`);
    }
    return [...seen.entries()];
  });
  return new Map(rows);
}

/** 레일이 데려가는 화면들과, 열어야 나오는 면 몇 개. */
async function walkStates(page: Page, snap: (name: string) => Promise<void>): Promise<void> {
  const field = await openQuickAdd(page);
  await field.fill("두 테마 검사");
  await field.press("Enter");
  await expect(page.getByText("두 테마 검사")).toBeVisible();
  await page.keyboard.press("Escape");
  await snap("목록");

  await page.locator('button.tm-task-open[aria-label*="두 테마 검사"]').first().click();
  await snap("상세 서랍");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await snap("명령 메뉴");
  await page.keyboard.press("Escape");

  for (const dest of ["Matrix", "Calendar", "Focus", "Settings"]) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator(`.global-rail button[aria-label="${dest}"]`).first().click();
    await snap(dest);
  }
}

async function collect(page: Page, theme: "light" | "dark"): Promise<Map<string, Map<string, string>>> {
  // 테마는 **심는다**, 흉내내지 않는다. 헬퍼의 `SeedOptions.theme` 주석이 이유를
  // 적어뒀다 — 앱은 `system` 을 `prefers-color-scheme` 에서 **마운트 때 한 번**
  // 읽는다. 매체를 뒤에 바꾸면 시작할 때의 팔레트를 상대로 단언하게 되고,
  // 실제로 그렇게 썼다가 다크에서 순백 면이 하나 잡혔다 [실측].
  await openApp(page, { lists: [{ id: "l1", name: "목록" }], theme });
  const out = new Map<string, Map<string, string>>();
  await walkStates(page, async (name) => {
    await page.waitForTimeout(600);
    out.set(name, await surfaces(page));
  });
  return out;
}

test.describe("두 테마의 면", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "칠해진 색을 세는 검사다");

  test("라이트의 밝은 면이 다크에 남아 있지 않다", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 8);

    const lightPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const light = await collect(lightPage, "light");
    await lightPage.close();

    const darkPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const dark = await collect(darkPage, "dark");
    await darkPage.close();

    expect(dark.size, "다크에서 아무 화면도 못 봤다면 이 검사는 아무것도 안 본 것이다").toBeGreaterThan(3);

    const leaks: string[] = [];
    for (const [name, darkSurfaces] of dark) {
      const lightSurfaces = light.get(name);
      if (!lightSurfaces) continue;
      for (const [key, who] of darkSurfaces) {
        if (lightSurfaces.has(key) && luminance(key) > BRIGHT) leaks.push(`  ${name}: rgb(${key})  ${who}`);
      }
    }

    expect(
      leaks,
      `다크에서 라이트와 똑같이 밝은 면이 칠해진다 — 어두운 앱 한가운데의 흰 카드는\n` +
        `대비 검사를 통과할 수 있다(글자도 같이 넘어왔다면). 눈으로만 보이는 결함이다:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  test("밝은 면을 심으면 잡는다 — 그물의 자기 점검", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    await openApp(page, { lists: [{ id: "l1", name: "목록" }], theme: "dark" });

    const before = await surfaces(page);
    expect(
      [...before.entries()].filter(([k]) => luminance(k) > BRIGHT).map(([k, who]) => `rgb(${k}) ${who}`),
      "심기 전에 이미 밝은 면이 있으면 아래 점검이 무엇을 잡았는지 알 수 없다",
    ).toEqual([]);

    await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.id = "bright-probe";
      probe.style.cssText = "position:fixed;left:40px;top:40px;width:200px;height:80px;background:#ffffff;z-index:9";
      document.body.appendChild(probe);
    });
    await page.waitForTimeout(300);

    const after = await surfaces(page);
    expect([...after.keys()].some((k) => luminance(k) > BRIGHT), "다크에 흰 상자를 놨는데 못 잡았다").toBe(true);

    await page.evaluate(() => document.getElementById("bright-probe")?.remove());
    await page.waitForTimeout(300);
    expect([...(await surfaces(page)).keys()].filter((k) => luminance(k) > BRIGHT), "표본을 걷으면 다시 깨끗해야 한다").toEqual([]);
  });
});
