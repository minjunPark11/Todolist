// 브레이크포인트도 자 위에 있다 (DRIFT_GUARD_DESIGN.md §4 G2).
//
// `scale.test.ts`가 지키는 것은 **값의 가짓수**다 — 크기 · 굵기 · 반경 · 간격이
// 선언된 스케일 밖으로 나가지 않는지. 그 자가 못 보는 것이 있다.
//
//     02-calendar.css   @container gcalbar (max-width: 640px)
//     27-calendar.css   @container gcalbar (max-width: 620px)
//
// 620도 640도 자 위의 값이다. 자는 "같은 뜻인지"를 묻지 않기 때문에 둘이 같은
// 경계를 가리키면서 다른 수를 적고 있다는 것을 말해주지 않았다. 그 20px 안에서
// 툴바 내용은 두 줄로 쌓이는데 높이는 56px에 잠긴 채였고, 뷰포트 769px에서 날짜
// 제목이 0px로 눌렸다 (CALENDAR_REFERENCE_PARITY_DESIGN.md §7-1).
//
// 같은 종류가 하나 더 있었다 — `19-app-shell.css`가 767, 다섯 파일이 768. 정확히
// 768px에서 레일만 남고 나머지는 좁은 폭 규칙으로 넘어가 있었다.
//
// 그래서 폭의 사다리를 선언하고, 그 밖의 값과 같은 컨테이너의 두 번째 임계값을
// 실패로 만든다. **천장은 없다.** 지금 트리가 사다리 위에 있으므로 이 파일은
// 0에서 시작한다 — 새 값이 정말 필요하면 숫자를 늘리는 것이 아니라 아래 표에
// 이유와 함께 한 줄을 더하는 것이 답이다(`scale.test.ts`가 못박은 그 방식).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * 뷰포트의 사다리.
 *
 * `N-1/N`(639 · 1023/1024 · 1279)과 `N/N+1`(900/901 · 960/961) 두 형식이 섞여
 * 있다. 각각은 겹치지 않으므로 그대로 두되, **같은 경계를 두 형식으로 적는 것**은
 * 767/768이 그랬듯 1px짜리 모순이 되므로 사다리가 하나만 싣는다.
 *
 * 600 · 680 · 1120 · 1240 · 1350은 짝 없는 단독이고, 전부 컴포넌트가 자리를
 * 잃는 지점이다 — 679/681을 나란히 찍어 확인했다: 680에서 설정 행이 라벨 위 ·
 * 컨트롤 아래로 접힌다. 이런 값은 통일 대상이 아니라 콘텐츠 임계점이다.
 */
const VIEWPORT_LADDER = new Map<number, string>([
  [600, "설정 > 서비스의 외부 캘린더 항목 (03-planning)"],
  [639, "모달이 바텀 시트가 되는 폭 = 640-1 (17-tasks-module)"],
  [680, "설정 행이 라벨 위 · 컨트롤 아래로 접힌다 (03-planning · 08-calendar-categories)"],
  [768, '이 앱이 "좁다"고 말하는 폭 — 레일이 사라진다'],
  [900, "사이드바가 열을 그만두는 폭"],
  [901, "900의 짝"],
  [960, "모달의 미리보기 열 (17-tasks-module · 26-timeline)"],
  [961, "960의 짝"],
  [1023, "데스크톱 셸의 경계 = 1024-1"],
  [1024, "1023의 짝"],
  [1120, "캘린더 격자 (02-calendar)"],
  [1240, "캘린더 · 스페이스의 넓은 단 (02-calendar · 05-spaces)"],
  [1279, "= 1280-1 (17-tasks-module · 19-app-shell)"],
  [1350, "캘린더 사이드바가 205px로 좁아진다 (27-calendar)"],
]);

/**
 * 컨테이너의 사다리 — 뷰포트와 다른 좌표계다.
 *
 * 컨테이너 쿼리는 요소의 **content box**를 잰다. `gcalbar`의 640이 뷰포트
 * 769px에서 걸렸던 것도 그래서다: 툴바의 border box는 665였고 padding 26px을
 * 빼면 639였다. 두 사다리를 한 집합에 섞으면 그 사실이 가려진다.
 */
const CONTAINER_LADDER = new Map<number, string>([
  [40, "막대가 글자를 전부 버리는 폭 (12-timeline)"],
  [72, "막대의 날짜 한 벌이 들어가지 않는 폭 (12-timeline · 26-timeline)"],
  [104, "막대의 날짜 두 벌 `12.31 – 12.31` (12-timeline)"],
  [130, "집중 트레이스의 총합이 빠지는 폭 (26-timeline)"],
  [640, "캘린더 툴바가 3단으로 쌓인다 (02-calendar · 27-calendar)"],
  [800, "캘린더 본문 (02-calendar)"],
]);

/** `styles.css`가 부르는 파일만 본다 — 부르지 않는 CSS는 화면에 없다. */
function loadedFiles(): string[] {
  const css = readFileSync(join(here, "..", "styles.css"), "utf8");
  return [...css.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);
}

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

/**
 * 주석 안의 `@media` · `@container`는 규칙이 아니다.
 *
 * 이 저장소의 주석은 자기가 고치는 규칙을 그대로 인용한다 — 27-calendar.css의
 * 주석 하나가 `@container gcalbar (max-width: 640px)`를 문장 안에 적고 있다.
 * 지우지 않으면 그 인용이 임계값으로 세어진다.
 */
function stripComments(css: string): string {
  // 주석을 같은 길이로 갈아끼운다 — 개행은 남기고 나머지는 공백. 통째로 지우면
  // 뒤따르는 모든 offset이 밀려 실패 메시지가 엉뚱한 줄을 가리킨다(처음에 그랬고,
  // `@container gcalbar`를 27-calendar.css:498 대신 :397이라고 불렀다). 틀린 줄
  // 번호는 없는 것보다 나쁘다.
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

type Rule = { file: string; line: number; text: string; widths: number[] };

function atRules(kind: "media" | "container"): Rule[] {
  const out: Rule[] = [];
  for (const file of loadedFiles()) {
    const raw = read(file);
    const clean = stripComments(raw);
    // 원본의 줄 번호를 살리려고 주석을 같은 길이의 공백으로 바꾸지 않고,
    // 지운 텍스트에서 찾은 위치를 원본 offset으로 되돌린다. 주석은 통째로
    // 공백 하나가 되므로, 줄 번호는 at-rule 앞의 개행 수로 센다.
    for (const m of clean.matchAll(new RegExp(`@${kind}\\b([^{]*)\\{`, "g"))) {
      const condition = m[1];
      const widths = [...condition.matchAll(/(?:max|min)-width:\s*(\d+)px/g)].map((w) =>
        Number(w[1]),
      );
      if (widths.length === 0) continue; // (pointer: coarse) · (prefers-reduced-motion) 따위
      const line = clean.slice(0, m.index).split("\n").length;
      out.push({ file, line, text: `@${kind}${condition.replace(/\s+/g, " ")}`.trim(), widths });
    }
  }
  return out;
}

describe("폭의 사다리 (DRIFT_GUARD §4 G2)", () => {
  it("모든 @media 폭이 뷰포트 사다리 위에 있다", () => {
    const off = atRules("media")
      .flatMap((r) => r.widths.map((w) => ({ ...r, w })))
      .filter((r) => !VIEWPORT_LADDER.has(r.w))
      .map((r) => `${r.file}:${r.line} ${r.w}px — ${r.text}`);
    expect(off, "사다리 밖의 폭은 숫자를 늘리는 것이 아니라 VIEWPORT_LADDER에 이유와 함께 적는다").toEqual([]);
  });

  it("모든 @container 폭이 컨테이너 사다리 위에 있다", () => {
    const off = atRules("container")
      .flatMap((r) => r.widths.map((w) => ({ ...r, w })))
      .filter((r) => !CONTAINER_LADDER.has(r.w))
      .map((r) => `${r.file}:${r.line} ${r.w}px — ${r.text}`);
    expect(off, "컨테이너는 content box를 잰다 — 뷰포트 사다리와 섞지 않는다").toEqual([]);
  });

  /**
   * 620과 640을 잡는 자리.
   *
   * 이름 있는 컨테이너 하나가 두 개의 서로 다른 임계값을 가지면, 그 사이 구간은
   * 두 규칙 중 하나만 걸린 반쪽 상태가 된다. `gcalbar`가 정확히 그랬다.
   */
  it("한 컨테이너 이름에 임계값은 하나다", () => {
    const byName = new Map<string, Map<number, string[]>>();
    for (const rule of atRules("container")) {
      const named = /@container\s+([A-Za-z][\w-]*)\s*\(/.exec(rule.text);
      if (!named) continue; // 익명 쿼리는 가장 가까운 컨테이너를 따라가므로 이름으로 묶을 수 없다
      const name = named[1];
      const per = byName.get(name) ?? new Map<number, string[]>();
      for (const w of rule.widths) per.set(w, [...(per.get(w) ?? []), `${rule.file}:${rule.line}`]);
      byName.set(name, per);
    }
    const split = [...byName.entries()]
      .filter(([, per]) => per.size > 1)
      .map(([name, per]) => `${name}: ${[...per].map(([w, at]) => `${w}px(${at.join(" ")})`).join(" vs ")}`);
    expect(split, "같은 경계를 두 수로 적으면 그 사이가 반쪽 상태가 된다").toEqual([]);
  });
});

/** `container: NAME / inline-size` · `container-name:` · `container-type:`을 선언한 셀렉터. */
function containerHosts(): { file: string; selector: string; name: string | null }[] {
  const hosts: { file: string; selector: string; name: string | null }[] = [];
  for (const file of loadedFiles()) {
    const clean = stripComments(read(file));
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = m;
      if (selector.trim().startsWith("@")) continue;
      const shorthand = /container:\s*([A-Za-z][\w-]*)\s*\/\s*inline-size/.exec(body);
      const named = /container-name:\s*([A-Za-z][\w-]*)/.exec(body);
      const typed = /container-type:\s*inline-size/.test(body);
      if (!shorthand && !named && !typed) continue;
      hosts.push({
        file,
        selector: selector.trim().replace(/\s+/g, " "),
        name: shorthand?.[1] ?? named?.[1] ?? null,
      });
    }
  }
  return hosts;
}

/** `@container` 블록 안의 최상위 셀렉터들. */
function containerBlockSelectors(): { file: string; name: string | null; selector: string }[] {
  const out: { file: string; name: string | null; selector: string }[] = [];
  for (const file of loadedFiles()) {
    const clean = stripComments(read(file));
    const re = /@container\b([^{]*)\{/g;
    for (let m = re.exec(clean); m; m = re.exec(clean)) {
      const name = /^\s*([A-Za-z][\w-]*)\s*\(/.exec(m[1])?.[1] ?? null;
      // 여는 중괄호부터 짝이 맞을 때까지 훑어 블록의 끝을 찾는다.
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      for (; i < clean.length && depth > 0; i += 1) {
        if (clean[i] === "{") depth += 1;
        else if (clean[i] === "}") depth -= 1;
      }
      const body = clean.slice(start, i - 1);
      for (const inner of body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        out.push({ file, name, selector: inner[1].trim().replace(/\s+/g, " ") });
      }
    }
  }
  return out;
}

describe("컨테이너는 자기 자신을 겨냥할 수 없다 (DRIFT_GUARD §4 G2)", () => {
  /**
   * 620/640보다 깊은 원인이었던 자리.
   *
   * `container: gcalbar / inline-size`가 `.gcal-toolbar` 자신에게 붙어 있었고,
   * 같은 파일이 `@container gcalbar (...) { .gcal-toolbar { ... } }`를 적었다.
   * `@container`는 컨테이너의 **자손**에만 걸리므로 그 블록은 한 번도 적용되지
   * 않았다 — 브라우저는 조용히 무시할 뿐 아무 말도 하지 않는다. 그래서 두 임계값이
   * 어긋난 것조차 증상을 바꿀 뿐 신호를 내지 않았다.
   *
   * 고침은 컨테이너를 한 단 위 `.gcal-main-column`으로 옮긴 것이었다. 이 테스트는
   * 그것이 되돌아오는 것을 막는다.
   */
  it("@container 블록의 셀렉터가 그 컨테이너를 선언한 셀렉터와 같지 않다", () => {
    const hosts = containerHosts();
    const named = new Map(hosts.filter((h) => h.name).map((h) => [h.name as string, h.selector]));
    const anonymous = new Set(hosts.filter((h) => !h.name).map((h) => h.selector));

    const selfAimed = containerBlockSelectors()
      .filter(({ name, selector }) =>
        name ? named.get(name) === selector : anonymous.has(selector),
      )
      .map(({ file, name, selector }) => `${file}: @container ${name ?? "(익명)"} → ${selector}`);

    expect(
      selfAimed,
      "자기 크기를 물어 자기를 고치는 규칙은 적용되지 않는다 — 컨테이너를 한 단 위로 옮긴다",
    ).toEqual([]);
  });

  it("사다리의 모든 값이 실제로 쓰이고 있다", () => {
    // 쓰이지 않는 값이 사다리에 남으면, 다음 사람은 그것을 승인된 경계로 읽는다.
    // 예외를 지우는 것이 예외를 늘리는 것보다 낫다(`scale.test.ts` EXEMPT 주석).
    const usedViewport = new Set(atRules("media").flatMap((r) => r.widths));
    const usedContainer = new Set(atRules("container").flatMap((r) => r.widths));
    expect([...VIEWPORT_LADDER.keys()].filter((w) => !usedViewport.has(w))).toEqual([]);
    expect([...CONTAINER_LADDER.keys()].filter((w) => !usedContainer.has(w))).toEqual([]);
  });
});
