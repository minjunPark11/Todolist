// 누를 것은 누를 만한 크기여야 한다 (WCAG 2.2 · 2.5.8 Target Size (Minimum), AA).
//
// 기준은 24×24 CSS 픽셀이고, 예외가 붙어 있다. 그중 하나가 이 앱에 실제로
// 걸리므로 그물이 그것까지 알아야 한다 — **간격 예외**: 작은 타깃이라도, 그
// 경계 상자의 중심에 지름 24px 원을 놓았을 때 그 원이 다른 타깃이나 다른 작은
// 타깃의 원과 겹치지 않으면 통과다. 즉 24px은 "이 컨트롤이 커야 하는 크기"가
// 아니라 "이 컨트롤이 혼자 차지해야 하는 자리"다. 그 반쪽만 구현한 그물은
// 멀쩡한 화면을 빨갛게 만든다.
//
// 이 리포에는 이미 손으로 잰 한 자리가 있다 — `taskRow.spec.ts`의 "the checkbox
// clears the touch floor"가 목록 행의 체크박스를 44px 바닥으로 검사한다. 44는
// 이 앱이 스스로 세운 터치 바닥이고 24는 WCAG의 AA 바닥이라 서로 다른 자다.
// 여기서 재는 것은 후자이고, 전자는 그 자리에 그대로 둔다: 한 화면의 한 컨트롤을
// 손으로 재는 테스트와, 다섯 화면의 모든 타깃을 쓸어 재는 테스트는 겹치지 않는다.
//
// 스타일시트로는 답이 나오지 않는다. `.gcal-check.is-chip { width: 22px }`는
// 미달처럼 보이지만 옆에 아무 타깃도 없으면 간격 예외로 통과하고,
// `.tm-task-check`는 15px짜리 입력을 품고도 라벨이 43px이라 통과한다 — 둘 다
// 브라우저가 실제로 그린 상자를 봐야 갈린다.
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./addList.helpers";

const LIST = { id: "list-target", name: "Target" };
const TODAY = "2026-09-15";
const NOW = new Date("2026-09-15T08:00:00");

const TASKS = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i}`,
  title: `Task number ${i}`,
  listId: LIST.id,
  dueDate: TODAY,
  startTime: `${String(7 + i).padStart(2, "0")}:00`,
  endTime: `${String(8 + i).padStart(2, "0")}:00`,
}));

/** WCAG 2.2 · 2.5.8 (AA). */
const FLOOR = 24;

/**
 * 포인터가 닿는 것으로 세는 것.
 *
 * 2.5.8이 말하는 '타깃'은 포인터 동작을 받는 영역이고, DOM만 보고는 React가 어디에
 * 핸들러를 걸었는지 알 수 없다. 그래서 그 대리로 **자기 역할을 선언한 것들**을
 * 센다 — 네이티브 컨트롤과, 역할을 붙였거나 탭 순서에 들어온 것들. 이름 없는
 * `<div onClick>`은 이 그물 밖이고, 그것은 이 스펙의 한계로 적어둘 일이지
 * 숨길 일이 아니다.
 */
const TARGETS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
  // 입력을 **품은** 라벨. 누르는 자리가 라벨이기 때문이다 — 목록 행의 체크박스가
  // 그 모양이고(15px 입력 · 43px 라벨), 입력만 재면 통과하는 자리를 미달로 적게 된다.
  //
  // `for=`로만 이어진 라벨은 일부러 뺀다. 그쪽도 누르면 동작하지만 2.5.8의
  // 등가 컨트롤 예외가 덮는 자리다 — 같은 일을 하는 컨트롤(입력 자체)이 같은
  // 화면에 있고 그쪽이 크기를 넘는다. 넣으면 폼의 글자 라벨 전부가 "높이 16px에
  // 제 입력과 붙어 있다"로 잡혀, 진짜 미달이 그 아래 묻힌다.
  "label:has(input)",
].join(",");

interface Offender {
  what: string;
  /** 실제로 그려진 상자. */
  size: string;
  /** 간격 예외를 깨뜨린 상대. */
  crowdedBy: string;
}

interface Sweep {
  measured: number;
  offenders: Offender[];
}

/**
 * 재지 않는 자리와, 그 이유.
 *
 * `radiusScale.spec.ts`의 `ALLOWED_OFF_SCALE`과 같은 장치다 — 적어두지 않은 예외가,
 * 스무 개짜리 목록이 조용히 늘어나는 방법이다. **비어 있다.**
 */
const EXEMPT: { selector: string; why: string }[] = [];

/**
 * 한 화면의 모든 타깃을 재고, 2.5.8을 적용한다.
 *
 * 세 가지가 이 함수를 단순한 `width >= 24` 검사와 가른다.
 *
 * 하나, **감싸는 쪽만 센다.** 후보 안에 후보가 있으면 바깥쪽이 누르는 자리다
 * (`label > input`, `button > span[role]`). 둘 다 세면 43px 라벨 안의 15px 입력이
 * 미달로 잡힌다 — 손가락이 닿는 것은 라벨인데.
 *
 * 둘, **간격 예외를 구현한다.** 작은 타깃은 그 중심의 지름 24px 원이 다른 타깃의
 * 경계 상자나 다른 작은 타깃의 원과 겹칠 때에만 위반이다. 겹치지 않으면 기준을
 * 만족한다 — 빼주는 것이 아니라 기준이 그렇다.
 *
 * 셋, **그려지지 않은 것은 세지 않는다.** `display: none`인 호버 핸들이나
 * `visibility: hidden`인 닫힌 사이드바는 누를 수 있는 자리가 아니다.
 */
async function sweep(page: Page, exempt: { selector: string; why: string }[]): Promise<Sweep> {
  return page.evaluate(
    ({ selector, floor, exemptSelectors }) => {
      const name = (el: Element): string => {
        const cls = typeof el.className === "string" && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).join(".")}`
          : "";
        const label = el.getAttribute("aria-label");
        return `${el.tagName.toLowerCase()}${cls}${label ? ` [${label.slice(0, 28)}]` : ""}`;
      };

      // 화면의 그 자리에서 실제로 닿는가.
      //
      // 덮인 것은 타깃이 아니다. 첫 실행에서 서랍의 컨트롤들이 "뒤에 있는 목록 행에
      // 붙어 있다"로 잡혔다 — 모바일에서 서랍은 목록 위를 덮는데, 그 아래 행의
      // 경계 상자는 DOM에 그대로 남아 있으므로 계산만 하면 이웃으로 세어진다.
      // 누를 수 없는 것과 간격을 다툴 일은 없다. 그래서 `elementFromPoint`로
      // 실제로 칠해진 결과를 묻는다(`focusObscured.spec.ts`와 같은 도구, 같은 이유).
      const reachable = (el: HTMLElement, r: DOMRect): boolean => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const xs = [r.left + 1, r.left + r.width / 2, r.right - 1];
        const ys = [r.top + 1, r.top + r.height / 2, r.bottom - 1];
        for (const x of xs) {
          for (const y of ys) {
            if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && (hit === el || el.contains(hit))) return true;
          }
        }
        return false;
      };

      const all = [...document.querySelectorAll<HTMLElement>(selector)];
      const candidates = all.filter((el) => {
        if (exemptSelectors.some((s) => el.closest(s))) return false;
        // 감싸는 쪽만. `el`을 품은 다른 후보가 있으면 이쪽은 안쪽이다.
        if (all.some((other) => other !== el && other.contains(el))) return false;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return reachable(el, rect);
      });

      const boxes = candidates.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          el,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          small: Math.min(r.width, r.height) < floor,
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });

      /**
       * 다투는 그 점이 정말 저쪽 것인가.
       *
       * 타깃이 부분적으로 덮이면 경계 상자는 그대로 남는다. 태블릿의 오른쪽 시트가
       * 그 경우였다 — 목록 행 버튼은 왼쪽 280px이 보이므로 닿을 수 있는 타깃이지만,
       * 시트 아래로 들어간 오른쪽 끝은 아무도 누를 수 없다. 상자로만 재면 시트 안의
       * 컨트롤들이 그 보이지 않는 오른쪽 끝과 "붙어 있다"로 잡힌다.
       *
       * 그래서 겹친다고 판단한 바로 그 점을 한 번 더 묻는다. 간격 예외가 말하는
       * 것은 손가락이 잘못 닿을 수 있는 이웃이고, 덮인 자리는 손가락이 닿지 않는다.
       */
      const owns = (el: HTMLElement, x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && (hit === el || el.contains(hit)));
      };

      const radius = floor / 2;
      const offenders: Offender[] = [];

      for (const target of boxes) {
        if (!target.small) continue;

        let crowdedBy = "";
        for (const other of boxes) {
          if (other === target) continue;

          if (other.small) {
            // 두 원이 겹치는가 — 중심 사이가 지름보다 가까우면 겹친다.
            const dx = target.cx - other.cx;
            const dy = target.cy - other.cy;
            if (Math.hypot(dx, dy) < floor && owns(other.el, other.cx, other.cy)) {
              crowdedBy = name(other.el);
              break;
            }
            continue;
          }

          // 원과 상자: 원의 중심을 상자 안으로 끌어당긴 점까지의 거리로 본다.
          const nearestX = Math.max(other.left, Math.min(target.cx, other.right));
          const nearestY = Math.max(other.top, Math.min(target.cy, other.bottom));
          if (Math.hypot(target.cx - nearestX, target.cy - nearestY) < radius && owns(other.el, nearestX, nearestY)) {
            crowdedBy = name(other.el);
            break;
          }
        }

        if (crowdedBy) {
          offenders.push({ what: name(target.el), size: `${target.w}×${target.h}`, crowdedBy });
        }
      }

      return { measured: boxes.length, offenders };
    },
    { selector: TARGETS, floor: FLOOR, exemptSelectors: exempt.map((e) => e.selector) },
  );
}

/**
 * 같은 컨트롤 하나를 한 줄로 접는다.
 *
 * 첫 실행의 캘린더가 177줄을 뱉었고 그중 대부분이 미니 월의 같은 날짜 버튼이었다.
 * 격자에 담긴 컨트롤은 격자 칸 수만큼 잡히므로, 줄 수는 문제의 크기가 아니라
 * 격자의 크기다. 고칠 것은 한 곳이고 목록도 한 줄이어야 한다.
 */
function summarize(offenders: Offender[]): string[] {
  const counted = new Map<string, { size: string; crowdedBy: string; n: number }>();
  for (const offender of offenders) {
    // `aria-label`은 칸마다 다르다(“9월 3일”). 접으려면 클래스까지만 본다.
    const key = offender.what.replace(/ \[.*$/, "");
    const seen = counted.get(key);
    if (seen) seen.n += 1;
    else counted.set(key, { size: offender.size, crowdedBy: offender.crowdedBy.replace(/ \[.*$/, ""), n: 1 });
  }
  return [...counted.entries()]
    .map(([what, { size, crowdedBy, n }]) => `${what} ${size}${n > 1 ? ` ×${n}` : ""} — ${crowdedBy} 옆`)
    .sort();
}

async function expectTargetsClear(page: Page, atLeast: number): Promise<void> {
  const { measured, offenders } = await sweep(page, EXEMPT);
  expect(summarize(offenders)).toEqual([]);
  // 초록이 "미달이 없다"가 아니라 "볼 것이 없었다"를 뜻하지 않도록.
  expect(measured).toBeGreaterThanOrEqual(atLeast);
}

test.describe("타깃 크기 (WCAG 2.2 · 2.5.8)", () => {
  test.beforeEach(async ({ page }) => {
    // `focusObscured.spec.ts`와 같은 이유로 같은 시각에 묶는다 — 시간 격자가
    // "지금"으로 열리므로 벽시계에 따라 화면에 있는 칩이 달라진다.
    await page.clock.setFixedTime(NOW);
    await openApp(page, { lists: [LIST], tasks: TASKS });
  });

  for (const [what, url, atLeast] of [
    ["목록", `/list/${LIST.id}`, 20],
    ["보드", `/list/${LIST.id}?view=board`, 15],
    ["타임라인", `/list/${LIST.id}?view=gantt`, 15],
    // 캘린더의 바닥만 낮다. 모바일에서는 사이드바가 접혀 미니 월의 서른다섯 칸이
    // 통째로 빠지고, 실제로 세어지는 것이 17개다. 스물을 요구하면 미달이 아니라
    // 화면의 폭 때문에 실패한다.
    ["캘린더", "/calendar", 15],
    ["상세 서랍", `/list/${LIST.id}?task=t0`, 10],
  ] as const) {
    test(`${what}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator(".tm-shell, .gcal-shell").first()).toBeVisible();
      await page.waitForTimeout(500);
      await expectTargetsClear(page, atLeast);
    });
  }

  /**
   * 그물이 잡는지, 그리고 **너무 많이 잡지는 않는지.**
   *
   * 앞의 두 스펙에서는 위반을 하나 만들어 보이는 것으로 충분했다. 여기서는
   * 반쪽이 더 필요하다: 간격 예외를 구현하지 않은 그물도 "작은 것을 잡는" 시험은
   * 통과하기 때문이다. 그래서 두 개를 심는다 — 붙어 있는 작은 것과, 혼자 떨어져
   * 있는 작은 것. 앞엣것만 잡히고 뒤엣것은 잡히지 않아야 그물이 기준을 재고
   * 있는 것이지 크기만 재고 있는 것이 아니다.
   */
  test("붙은 것은 잡고 떨어진 것은 두고 — 그물의 자기 점검", async ({ page }) => {
    await page.goto(`/list/${LIST.id}`);
    await expect(page.locator(".tm-shell")).toBeVisible();
    await page.waitForTimeout(500);

    const clean = await sweep(page, EXEMPT);
    expect(clean.offenders).toEqual([]);

    await page.evaluate(() => {
      // 화면을 덮고 그 위에 심는다. 앱의 레이아웃 위에 그냥 놓으면 "혼자인 하나"를
      // 놓을 빈자리가 뷰포트마다 다르다 — 첫 시도에서 왼쪽 위 구석에 놓았다가
      // 데스크톱의 레일 버튼과 붙어 잡혔다. 판은 타깃이 아니고, 그 아래 모든
      // 타깃은 위의 `reachable`이 걷어낸다. 그러므로 이 시험이 보는 것은 심은
      // 셋뿐이다.
      const lid = document.createElement("div");
      lid.style.cssText = "position:fixed;inset:0;z-index:9000;background:#fff";
      document.body.appendChild(lid);

      const plant = (id: string, left: number, top: number) => {
        const button = document.createElement("button");
        button.id = id;
        button.setAttribute("aria-label", id);
        button.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:12px;height:12px;z-index:9999`;
        lid.appendChild(button);
      };
      // 붙은 둘: 중심 사이가 14px이라 지름 24px 원이 서로를 파고든다.
      plant("crowded-a", 100, 200);
      plant("crowded-b", 114, 200);
      // 혼자인 하나: 판 위에서 100px 넘게 떨어져 있다.
      plant("lonely", 100, 400);
    });

    const found = await sweep(page, EXEMPT);
    const names = found.offenders.map((o) => o.what);
    expect(names.some((n) => n.includes("crowded-a"))).toBe(true);
    expect(names.some((n) => n.includes("crowded-b"))).toBe(true);
    expect(names.some((n) => n.includes("lonely"))).toBe(false);
  });
});
