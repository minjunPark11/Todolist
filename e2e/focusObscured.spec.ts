// 포커스가 무엇 뒤로도 숨지 않는다 (WCAG 2.2 · 2.4.11 Focus Not Obscured).
//
// 기준은 이렇게 읽힌다: 키보드로 어떤 컨트롤에 닿았을 때, 그 컨트롤이 페이지가
// 그린 다른 것에 **완전히** 가려져서는 안 된다. 겹치는 것은 괜찮고, 사라지는
// 것이 안 된다. 이 앱에서 그 일이 일어날 수 있는 자리는 정해져 있다 — 스크롤
// 하는 상자 위에 붙어 있는 것들이다. 레일(`.global-rail`, sticky), 캘린더의
// 머리(`.gcal-timegrid-sticky`, z 30), 타임라인의 머리(`.ff-timeline-head`),
// 그리고 떠 있는 바들.
//
// 이것이 E2E인 이유는 `a11y.test.tsx`가 자기 한계로 적어둔 그대로다: "jsdom은
// 레이아웃을 계산하지 않는다". 무엇이 무엇을 덮는가는 레이아웃 그 자체이고,
// 여기서 쓰는 `elementFromPoint`는 브라우저가 실제로 칠한 결과를 묻는 함수다.
// 스타일시트를 읽어서는 답이 나오지 않는다 — sticky 한 줄이 위반인지 아닌지는
// 그것이 스크롤 상자를 덮느냐 위에 자리를 차지하느냐에 달렸고, 이 리포의
// `.tm-drawer-head`는 후자다(17-tasks-module.css:1050이 §1.17로 그렇게 바꿨다).
//
// `scroll-padding`이 리포 전체에 한 곳도 없다는 것이 이 스펙을 쓴 이유다. 붙어
// 있는 머리 아래로 스크롤되는 상자가 생기면, 브라우저는 포커스를 그 상자의 위
// 끝에 맞춰 세우고 머리가 그것을 덮는다. 지금은 그런 자리가 없다 — 없다는 것을
// 재두는 것이 이 스펙이고, 마지막 테스트가 이 그물이 실제로 무언가를 잡을 수
// 있는지 확인한다.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const LIST = { id: "list-focus", name: "Focus" };
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * 화면이 스크롤될 만큼의 데이터.
 *
 * `radiusScale.spec.ts`가 적어둔 것과 같은 이유다 — 빈 계정은 이 스펙이 말하는
 * 자리를 하나도 그리지 않는다. 시각까지 주는 것은 캘린더 때문이고(시각이 없는
 * 할 일은 시간 격자가 아니라 종일 줄에 앉는다), 16개인 것은 1440×900에서 시간
 * 격자가 세로로 넘치기 시작하는 수다.
 */
const TASKS = Array.from({ length: 16 }, (_, i) => ({
  id: `t${i}`,
  title: `Task number ${i}`,
  listId: LIST.id,
  dueDate: TODAY,
  startTime: `${String(5 + i).padStart(2, "0")}:00`,
  endTime: `${String(6 + i).padStart(2, "0")}:00`,
  description: "한 줄\n두 줄\n세 줄",
}));

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface Offender {
  /** 어떤 컨트롤인가 — 태그와 클래스. */
  what: string;
  /** 왜 걸렸는가. */
  why: "가려짐" | "화면 밖";
  /** 덮은 쪽. `화면 밖`에는 없다. */
  by?: string;
  top: number;
}

interface Sweep {
  /** 실제로 포커스를 받은 컨트롤의 수. 0이면 이 스펙은 아무것도 증명하지 않는다. */
  focused: number;
  offenders: Offender[];
}

/**
 * 포커스를 하나씩 옮겨가며, 그 자리에서 실제로 보이는지 묻는다.
 *
 * 두 가지가 이 함수를 순진한 구현과 가른다.
 *
 * 하나, `document.activeElement === el`로 거른다. 셀렉터에 걸리는 것과 포커스를
 * 받는 것은 다르다 — 모바일에서 닫힌 사이드바는 `visibility: hidden`이고
 * (`.tm-sidebar`, transform으로 -280px), 그 안의 행 일곱 개는 셀렉터에 걸리지만
 * 브라우저가 포커스를 주지 않는다. 그것을 세면 고칠 것이 없는 위반이 일곱 개
 * 잡히고, 실제로 첫 구현이 그렇게 잡았다.
 *
 * 둘, 점 하나가 아니라 격자로 친다. 가운데 한 점만 보면 컨트롤 한가운데를 지나는
 * 얇은 구분선 하나에도 "가려졌다"가 나온다. 25점 중 하나라도 자기 자신(또는 자기
 * 자손·조상)에게 닿으면 그 자리는 보인다 — 기준이 말하는 것은 '완전히' 가려지는
 * 것이다.
 *
 * 조상을 통과로 세는 이유: 어떤 점에서 제일 위에 오는 것이 자기 조상이라는 말은,
 * 그 자리에 남의 것이 얹혀 있지 않다는 뜻이다. 컨트롤의 투명한 여백을 지나 부모가
 * 잡히는 경우이고, 포커스 윤곽은 그 위에 그려진다.
 */
async function sweep(page: Page): Promise<Sweep> {
  return page.evaluate((selector) => {
    const offenders: Offender[] = [];
    let focused = 0;

    const name = (el: Element | null): string => {
      if (!el) return "(없음)";
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
    };

    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      // 스크롤을 막지 않는다 — 포커스가 화면 안으로 끌려 들어오는 그 동작이
      // 기준이 말하는 상황을 만든다. 막으면 재는 것이 달라진다.
      el.focus();
      if (document.activeElement !== el) continue;
      focused += 1;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(rect.left, 0);
      const right = Math.min(rect.right, vw);
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, vh);

      // 브라우저가 끌어들이고도 화면 안에 들이지 못했다면, 덮인 것과 결과가
      // 같다 — 포커스가 어디 있는지 보이지 않는다.
      if (right <= left || bottom <= top) {
        offenders.push({ what: name(el), why: "화면 밖", top: Math.round(rect.top) });
        continue;
      }

      let visible = 0;
      let by = "";
      for (let i = 0; i <= 4; i += 1) {
        for (let j = 0; j <= 4; j += 1) {
          const x = Math.min(left + ((right - left) * i) / 4, vw - 1);
          const y = Math.min(top + ((bottom - top) * j) / 4, vh - 1);
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit) || hit.contains(el))) visible += 1;
          else if (hit && !by) by = name(hit);
        }
      }

      if (visible === 0) {
        offenders.push({ what: name(el), why: "가려짐", by, top: Math.round(rect.top) });
      }
    }

    return { focused, offenders };
  }, FOCUSABLE);
}

/**
 * 한 화면을 쓸고, 아무것도 숨지 않았는지 묻는다.
 *
 * `focused`에 바닥을 두는 이유는 초록이 두 가지를 뜻할 수 있기 때문이다 —
 * "가려진 것이 없다"와 "볼 것이 없었다". 둘째라면 이 스펙은 매일 통과하면서
 * 아무것도 지키지 않는다.
 */
async function expectNothingHidden(page: Page, atLeast: number): Promise<void> {
  const { focused, offenders } = await sweep(page);
  expect(offenders).toEqual([]);
  expect(focused).toBeGreaterThanOrEqual(atLeast);
}

/**
 * 아직 지고 있는 하나 — 덮는 상세가 뒤를 재우지 않는다.
 *
 * 상세는 다섯 가지로 발표된다(`TASK_DETAIL_PRESENTATION`). 넓은 데스크톱의
 * `inline-drawer`는 자기 열을 차지하므로 뒤를 덮지 않고, 이 스펙도 거기서는
 * 통과한다. 태블릿의 `right-sheet`와 모바일의 `full-screen`은 목록 위에 얹히는데,
 * 그 아래 목록의 행·체크박스·메뉴 버튼이 여전히 포커스를 받는다 — 완전히 가려진
 * 채로. 2.4.11이 말하는 바로 그 상태다.
 *
 * 설계가 이미 반대편을 적어뒀다는 점이 이것을 틈으로 만든다. §15.13은
 * "전체 화면 상세가 화면을 가진다. 뒤에 있는 것은 흐려지는 것이 아니라 비켜난다"
 * 이고, CSS는 그 말대로 메뉴 트리거까지 숨긴다(17-tasks-module.css:2724). 비켜나지
 * 않은 것은 탭 순서뿐이다. 마우스에게는 비켜났고 키보드에게는 아니다.
 *
 * 고치는 자리는 이 스펙이 아니라 `TasksModule`이고(덮는 발표일 때 뒤의 영역을
 * `inert`로), 그것은 포커스 관리의 결정이라 이 파일이 혼자 내릴 것이 아니다.
 * 그때까지 `test.fail()`로 적어둔다 — Playwright는 이 표시가 붙은 테스트가
 * **통과하면** 실패로 뒤집는다. 고쳐지는 순간 이 줄을 지우라고 빨간불이 켜지는
 * 쪽이고, KNOWN 목록과 같은 래칫이다.
 *
 * 프로젝트 이름이 아니라 DOM에서 발표 방식을 읽는 이유: 이 표시가 "모바일에서는
 * 봐준다"가 아니라 "덮는 발표에서는 아직 못 고쳤다"를 뜻하게 하려는 것이다.
 * 브레이크포인트가 옮겨가도 표시는 같은 것을 가리킨다.
 */
async function expectOverlayDetailIsKnownToFail(page: Page): Promise<void> {
  const drawer = page.locator(".tm-drawer").first();
  if ((await drawer.count()) === 0) return;
  const classes = (await drawer.getAttribute("class")) ?? "";
  if (/is-right-sheet|is-full-screen/.test(classes)) test.fail();
}

test.describe("포커스가 가려지지 않는다 (WCAG 2.2 · 2.4.11)", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { lists: [LIST], tasks: TASKS });
  });

  /**
   * 화면마다 붙어 있는 것이 다르다.
   *
   * 목록에는 레일이, 캘린더에는 그 위에 z 30으로 머리가, 타임라인에는
   * `.ff-timeline-head`가 있고, 보드는 가로로 스크롤한다 — 세로로 덮는 것이
   * 없는 대신 화면 밖으로 밀어내는 쪽이 있다. 상세 서랍은 §1.17이 머리를 스크롤
   * 상자 밖으로 꺼낸 자리이고, 이 스펙이 그 결정을 지키는 쪽이다.
   */
  for (const [what, url, atLeast] of [
    ["목록", `/list/${LIST.id}`, 20],
    ["보드", `/list/${LIST.id}?view=board`, 20],
    ["타임라인", `/list/${LIST.id}?view=gantt`, 20],
    ["캘린더", "/calendar", 20],
    ["상세 서랍", `/list/${LIST.id}?task=t0`, 20],
  ] as const) {
    test(`${what}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator(".tm-shell, .gcal-shell").first()).toBeVisible();
      // 붙어 있는 것들은 첫 페인트가 아니라 레이아웃이 자리를 잡은 뒤에 제자리에
      // 온다. 그 전에 재면 아직 아무것도 덮고 있지 않다.
      await page.waitForTimeout(500);
      await expectOverlayDetailIsKnownToFail(page);
      await expectNothingHidden(page, atLeast);
    });
  }

  /**
   * 그물이 실제로 잡는지.
   *
   * `radiusScale.spec.ts`의 `expectPill`과 같은 장치다 — 통과하는 스펙은 두 가지를
   * 뜻할 수 있고, 그중 "보지 않았다"를 배제해야 나머지 하나가 증거가 된다. 여기서는
   * 위반을 하나 만들어 보이고, 만든 그것이 잡히는지 묻는다.
   *
   * 덮개는 목록 영역 위에만 놓는다. 화면 전체를 덮으면 모든 컨트롤이 걸려서,
   * 그물이 *무엇을* 잡았는지가 아니라 몇 개를 잡았는지만 알게 된다.
   */
  test("덮으면 잡힌다 — 그물의 자기 점검", async ({ page }) => {
    await page.goto(`/list/${LIST.id}`);
    await expect(page.locator(".tm-shell")).toBeVisible();
    await page.waitForTimeout(500);

    const clean = await sweep(page);
    expect(clean.offenders).toEqual([]);

    // 스크롤 상자 위에 붙은 머리가 하는 일을 한 번에 하는 판. `scroll-padding`
    // 없이 sticky 머리를 들이면 이것의 얇은 판이 같은 일을 한다.
    const covered = await page.evaluate(() => {
      const main = document.querySelector(".tm-main");
      if (!main) return { planted: false };
      const box = main.getBoundingClientRect();
      const lid = document.createElement("div");
      lid.id = "obscure-probe";
      lid.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;z-index:9999;background:#fff`;
      document.body.appendChild(lid);
      return { planted: true };
    });
    expect(covered.planted).toBe(true);

    const found = await sweep(page);
    expect(found.offenders.length).toBeGreaterThan(0);
    // 잡은 것이 덮개 아래의 것들이어야 한다. 레일과 사이드바는 판 밖에 있으므로
    // 그대로 통과해야 하고, 그것까지 걸린다면 이 그물은 자리를 가리지 못한다.
    expect(found.offenders.every((o) => o.why === "가려짐" && o.by === "div")).toBe(true);
    expect(found.focused).toBe(clean.focused);
  });
});
