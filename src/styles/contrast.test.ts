// 손으로 재던 것을 자동으로 잰다.
//
// `01-base.css`의 다크 블록에는 이미 대비비가 주석으로 적혀 있다 — "글자로 쓰면
// 4.66이지만 그 위에 흰 글자를 얹으면 3.65로 AA에 미달한다", "`--danger-ink`의
// #c0271d는 어두운 카드 위에서 2.65". 누군가 계산기를 열고 값을 골랐다는 뜻이고,
// 그 판단은 옳았다. 문제는 그 다음이다: `25-reference.css`가 나중에 로드되면서
// `--accent`와 `--accent-fill`을 갈아끼웠고(§레퍼런스 정합), 주석의 숫자는 그
// 자리에 그대로 남았다. **지금 화면에 도달하는 색은 그 주석이 잰 색이 아니다.**
//
// 이 파일이 막는 것이 그 틈이다. 토큰은 여섯 겹의 파일과 두 테마와 다섯 개의
// 액센트 선택을 지나 최종값이 되고, 그 최종값을 사람이 머릿속에서 따라가는 것은
// 이미 불가능하다. 여기서는 `styles.css`가 부르는 순서 그대로 캐스케이드를
// 재현해서 실제로 합성되는 색을 얻고, WCAG 상대 휘도로 그 쌍을 잰다.
//
// **`a11y.test.tsx`가 못 보는 자리다.** 그 파일은 자기 한계를 이렇게 적어뒀다:
// "jsdom은 레이아웃을 계산하지 않고 아무것도 칠하지 않으므로 `color-contrast`는
// 여기서 꺼져 있다(샘플링할 픽셀이 없다)". axe가 끈 그 규칙을, 픽셀 대신 토큰
// 위에서 켜는 것이 이 테스트다. 둘은 겹치지 않는다.
//
// 재지 않는 것도 적어둔다. 이것은 **토큰 쌍**의 자이지 화면의 자가 아니다. 어떤
// 글자가 실제로 어떤 바탕 위에 앉는지는 DOM이 정하고, 이 파일은 아래 표에 적힌
// 쌍만 본다 — 표에 없는 조합은 재지 않으며, 표의 한 줄은 CSS에서 확인한 자리
// 하나다(근거를 줄마다 적었다). 픽셀을 재는 쪽은 여전히 브라우저이고,
// `e2e/`가 그 자리다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

/** WCAG 2.2 — 본문 글자(1.4.3 AA). */
const TEXT_AA = 4.5;
/** WCAG 2.2 — 글자가 아닌 것(1.4.11 AA): 포커스 표시와 컨트롤의 면. */
const NONTEXT_AA = 3;

/**
 * `App.tsx`가 `<html>`에 거는 두 축.
 *
 * 테마는 둘, 액센트는 다섯이다. 다섯을 다 도는 이유는 `25-reference.css` §액센트가
 * 적어둔 사고 그대로다 — 거기 `:root`에 `--accent` 한 줄을 적었더니 blue를 뺀 넷이
 * 전부 죽었고, 기본값이 blue라 스크린샷에서는 멀쩡해 보였다. 대비도 같은 방식으로
 * 조용히 깨진다: 기본 테마만 재면 green을 고른 사람의 화면은 아무도 안 잰다.
 */
const ACCENTS = ["blue", "purple", "green", "pink", "orange"] as const;
const THEMES = ["light", "dark"] as const;
type Accent = (typeof ACCENTS)[number];
type Theme = (typeof THEMES)[number];
type Ctx = { theme: Theme; accent: Accent };

type Block = {
  /** 이 블록이 그 문맥에 적용되는가. */
  applies: (ctx: Ctx) => boolean;
  /** 셀렉터 특정도의 서열. 같으면 소스 순서가 이긴다. */
  rank: number;
  order: number;
  decls: [string, string][];
};

/**
 * 테마 블록만 걷는다.
 *
 * 토큰을 선언하는 셀렉터는 리포 전체에서 다섯 모양뿐이다(`:root`,
 * `[data-theme="dark"]`, `[data-accent="X"]`, `:root:not([data-accent="blue"])`,
 * 그리고 `.gcal-timegrid` 따위의 자손 스코프). 앞의 넷이 문서 전체를 물들이는
 * 쪽이고, 마지막은 한 컴포넌트 안에서만 사는 값이라 여기서 보지 않는다 —
 * 그것까지 보려면 DOM이 필요하고, 그건 이 파일의 자가 아니다(맨 위 주석).
 */
function themeBlocks(): Block[] {
  const barrel = readFileSync(join(HERE, "..", "styles.css"), "utf8");
  const files = [...barrel.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);
  const blocks: Block[] = [];

  for (const name of files) {
    const css = readFileSync(join(HERE, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = /(^|\n)([^{}\n][^{}]*)\{/g;
    let hit: RegExpExecArray | null;

    while ((hit = selectors.exec(css))) {
      const selector = hit[2].trim();
      // 중첩을 세어 블록의 끝을 찾는다. `@media`가 토큰을 감싸는 자리가 있다.
      let i = selectors.lastIndex;
      let depth = 1;
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") depth -= 1;
        i += 1;
      }
      const body = css.slice(selectors.lastIndex, i - 1);
      const decls = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
        (m) => [m[1], m[2].trim()] as [string, string],
      );
      if (decls.length === 0) continue;

      let applies: Block["applies"] | null = null;
      let rank = 1;

      if (selector === ":root") applies = () => true;
      else if (selector === '[data-theme="dark"]') applies = (c) => c.theme === "dark";
      else if (/^\[data-accent="\w+"\]$/.test(selector)) {
        const accent = selector.slice('[data-accent="'.length, -2);
        applies = (c) => c.accent === accent;
      } else if (selector === ':root:not([data-accent="blue"])') {
        // (0,2,0). `--accent-ink`가 blue 전용 잉크를 덮는 자리이고, 특정도가
        // 높아서 소스 순서와 무관하게 이긴다 (25-reference.css).
        applies = (c) => c.accent !== "blue";
        rank = 2;
      }

      if (!applies) continue;
      blocks.push({ applies, rank, order: blocks.length, decls });
    }
  }

  return blocks;
}

const BLOCKS = themeBlocks();

/** 한 문맥에서 살아남는 선언만 남긴 토큰 표. */
function tokensFor(ctx: Ctx): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of BLOCKS.filter((b) => b.applies(ctx)).sort((a, b) => a.rank - b.rank || a.order - b.order)) {
    for (const [name, value] of block.decls) map.set(name, value);
  }
  return map;
}

/**
 * `var()` 사슬을 끝까지 따라간다.
 *
 * 이 리포의 색은 거의 전부 다른 토큰을 가리킨다 — `--color-ink-muted-48` →
 * `--text-tertiary` → `--text-label` → `#666b72`가 실제 사슬이다. 중간 한 칸을
 * 보고 판단하면 `#7a7a7a`(4.29)라는, 화면에 도달하지 않는 값을 재게 된다.
 */
function resolve(value: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 12) return value;
  const call = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(value.trim());
  if (!call) return value.trim();
  const referenced = tokens.get(call[1]);
  if (referenced !== undefined) return resolve(referenced, tokens, depth + 1);
  return call[2] ? resolve(call[2], tokens, depth + 1) : `미정의(${call[1]})`;
}

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba | null {
  const text = value.trim();
  const long = /^#([0-9a-f]{6})$/i.exec(text);
  if (long) {
    return [
      parseInt(long[1].slice(0, 2), 16),
      parseInt(long[1].slice(2, 4), 16),
      parseInt(long[1].slice(4, 6), 16),
      1,
    ];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(text);
  if (short) return [...short[1]].map((c) => parseInt(c + c, 16)).concat(1) as unknown as Rgba;

  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.%]+)\s*)?\)$/i.exec(text);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return [Number(fn[1]), Number(fn[2]), Number(fn[3]), alpha];
  }
  return null;
}

/** 반투명한 것은 자기 뒤의 바탕과 섞인 뒤에야 색이 된다 — `--accent-soft`가 그렇다. */
function composite(front: Rgba, back: Rgba): Rgba {
  if (front[3] >= 1) return front;
  const mixed = [0, 1, 2].map((i) => front[i] * front[3] + back[i] * (1 - front[3]));
  return [mixed[0], mixed[1], mixed[2], 1];
}

/** WCAG 2.x 상대 휘도. */
function luminance([r, g, b]: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** 소수 둘째 자리까지. 아래 표의 바닥값과 같은 자리에서 비교하기 위해서다. */
function contrast(front: Rgba, back: Rgba): number {
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

type Pair = {
  /** 앞의 색. 글자이거나, 글자가 아닌 것의 면이다. */
  fg: string;
  /** 바탕. 반투명하면 `over` 위에 먼저 얹힌다. */
  bg: string;
  /** 바탕 자신이 반투명할 때 그 뒤에 오는 불투명한 면. */
  over?: string;
  target: number;
  why: string;
};

/**
 * 글자와 그 바탕 (1.4.3 AA · 4.5:1).
 *
 * 표의 한 줄은 CSS에서 확인한 자리 하나다. 캔버스는 넷뿐이다 — 카드
 * (`--bg-surface`), 앱 바탕(`--bg-app`), 레일(`--bg-rail`, 19-app-shell.css:192),
 * 문맥 사이드바(`--bg-context-sidebar`, 17-tasks-module.css:41). §11.6이 이 셋을
 * "세 개의 면이지 하나가 아니다"라고 부르고 일부러 가깝게 뒀는데, 가까운 만큼
 * 글자 쪽의 여유가 캔버스마다 다르다. 그래서 캔버스별로 잰다.
 *
 * `--bg-sidebar`는 없다. 다크에서 #ffffff로 남아 있어 처음엔 위반으로 잡혔지만,
 * 따라가 보니 `--ff-sidebar`를 거쳐 아무도 부르지 않는 죽은 토큰이었다. 죽은
 * 토큰을 재면 고칠 것이 없는 실패가 매일 뜬다 — 아래 "표의 토큰은 살아 있다"가
 * 그것을 막는 쪽이다.
 */
const TEXT_PAIRS: Pair[] = [
  { fg: "--text-primary", bg: "--bg-surface", target: TEXT_AA, why: "카드 위의 본문" },
  { fg: "--text-secondary", bg: "--bg-surface", target: TEXT_AA, why: "카드 위의 보조 글자" },
  { fg: "--text-tertiary", bg: "--bg-surface", target: TEXT_AA, why: "17-tasks-module.css:422" },
  { fg: "--text-muted", bg: "--bg-surface", target: TEXT_AA, why: "17-tasks-module.css:60 등 83곳" },
  { fg: "--text-primary", bg: "--bg-app", target: TEXT_AA, why: "앱 바탕 위의 본문" },
  { fg: "--text-tertiary", bg: "--bg-app", target: TEXT_AA, why: "앱 바탕 위의 라벨" },
  { fg: "--text-primary", bg: "--bg-surface-muted", target: TEXT_AA, why: "가라앉힌 면 위의 본문" },
  { fg: "--text-tertiary", bg: "--bg-surface-muted", target: TEXT_AA, why: "가라앉힌 면 위의 라벨" },
  { fg: "--text-primary", bg: "--bg-context-sidebar", target: TEXT_AA, why: "사이드바의 목록 이름" },
  { fg: "--text-muted", bg: "--bg-context-sidebar", target: TEXT_AA, why: "17-tasks-module.css:60" },
  { fg: "--text-tertiary", bg: "--bg-context-sidebar", target: TEXT_AA, why: "17-tasks-module.css:422" },
  // 액센트를 글자로 쓰는 자리는 `color: var(--accent)`만 73곳이다. 링크·활성 라벨·
  // 오늘 날짜가 전부 여기 속한다.
  { fg: "--accent", bg: "--bg-surface", target: TEXT_AA, why: "카드 위의 액센트 글자 (73곳)" },
  { fg: "--accent", bg: "--bg-app", target: TEXT_AA, why: "앱 바탕 위의 액센트 글자" },
  // 면 위의 글자. §13.1이 적어둔 그 자리 — 액센트를 '글자'로만 재고 '면'으로는
  // 재지 않아서 흰 글자가 미달했던 곳이다. 앞의 색이 `--bg-surface`가 아닌 이유는
  // 다크에서 갈린다: 채워진 버튼의 글자는 테마와 무관하게 흰색이고
  // (02-calendar.css:1695 · 05-spaces.css:208), 카드색을 얹으면 다크에서
  // 검은 글자를 재게 된다.
  { fg: "--color-on-dark", bg: "--accent-fill", target: TEXT_AA, why: "채워진 버튼 위의 글자 (01-base.css §13.1)" },
];

/**
 * 연면 위의 잉크 (1.4.3 AA · 4.5:1).
 *
 * `*-soft`는 대부분 알파를 가진 색이라 뒤의 카드와 먼저 섞인다. 이 네 쌍은
 * 01-base.css가 이름으로 짝지어 둔 것 그대로다 — 잉크는 자기 연면 위에 앉는다.
 */
const INK_PAIRS: Pair[] = [
  { fg: "--accent-ink", bg: "--accent-soft", over: "--bg-surface", target: TEXT_AA, why: "선택된 행·칩의 글자" },
  { fg: "--danger-ink", bg: "--danger-soft", over: "--bg-surface", target: TEXT_AA, why: "위험 상태의 칩" },
  { fg: "--success-ink", bg: "--success-soft", over: "--bg-surface", target: TEXT_AA, why: "완료 상태의 칩" },
  { fg: "--warning-ink", bg: "--warning-soft", over: "--bg-surface", target: TEXT_AA, why: "경고 상태의 칩" },
];

/**
 * 글자가 아닌 것 (1.4.11 AA · 3:1).
 *
 * 포커스 표시가 여기 있는 이유는 `01-base.css`의 `:focus-visible` 주석이 적어둔
 * 그대로다: 그 자리는 "두 개의 포커스 언어" 중 하나가 브라우저 기본값이던 것을
 * 하나로 모은 곳이고, 모아둔 이상 그 하나가 바탕에서 보여야 한다. 실제로 그려지는
 * 색은 `--ff-focus-ring`이다 — `--focus-ring`(반투명)은 선언만 있고 부르는 곳이
 * 없다.
 */
const NONTEXT_PAIRS: Pair[] = [
  { fg: "--ff-focus-ring", bg: "--bg-surface", target: NONTEXT_AA, why: "01-base.css:699 — 카드 위의 포커스 윤곽" },
  { fg: "--ff-focus-ring", bg: "--bg-app", target: NONTEXT_AA, why: "앱 바탕 위의 포커스 윤곽" },
  { fg: "--ff-focus-ring", bg: "--bg-rail", target: NONTEXT_AA, why: "19-app-shell.css:288 — 레일의 포커스 윤곽" },
  { fg: "--accent-fill", bg: "--bg-surface", target: NONTEXT_AA, why: "체크박스·채워진 버튼의 면" },
  // 레일 항목은 글자가 아니라 글리프다 — `RailButton`은 아이콘 하나에 `aria-label`과
  // 툴팁을 달아 보내고, 보이는 것 중 글자는 없다(GlobalRail.tsx:141). 그래서 1.4.3이
  // 아니라 1.4.11이 다스린다. 쉴 때 muted, 올리면 text, 현재 위치는 blue다
  // (19-app-shell.css:260·267·278).
  { fg: "--ff-muted", bg: "--bg-rail", target: NONTEXT_AA, why: "19-app-shell.css:260 — 쉬고 있는 레일 글리프" },
  { fg: "--ff-text", bg: "--bg-rail", target: NONTEXT_AA, why: "19-app-shell.css:267 — 올린 레일 글리프" },
  { fg: "--ff-blue", bg: "--bg-rail", target: NONTEXT_AA, why: "19-app-shell.css:278 — 켜진 레일 글리프" },
];

const ALL_PAIRS = [...TEXT_PAIRS, ...INK_PAIRS, ...NONTEXT_PAIRS];

/**
 * 아직 목표에 못 미치는 쌍과, 지금 재어진 값.
 *
 * `scale.test.ts`의 CEILING과 같은 장치이고 같은 규칙이다 — 나빠지면 잡고,
 * 좋아지면 숫자를 내리라고 잡는다. 여기 한 줄을 적는 것은 "괜찮다"가 아니라
 * "지금 이만큼이고, 더 나빠지지는 않는다"는 뜻이다.
 *
 * 색을 고르는 일은 이 테스트의 일이 아니라서, 처음 재어진 값을 그대로 적었다.
 * 줄마다 적힌 것이 고쳐야 할 것의 목록이다.
 */
const KNOWN: Record<string, number> = {
  // 테마 전체가 지고 있는 하나. 연면 위의 위험 잉크가 0.54 모자란다 — 다크의
  // 같은 자리는 5.09로 넘는데, 01-base.css의 주석이 적어둔 그 이유다:
  // "같은 의미색이 테마마다 반대 방향을 요구한다". 라이트 쪽 #d2453e는 그
  // 방향으로 한 칸 덜 갔다.
  "light | --danger-ink on --danger-soft": 3.96,

  // 기본 테마(blue)의 유일한 미달. #556be7은 카드(#ffffff) 위에서 4.52로 넘고
  // 앱 바탕(#f6f6f4) 위에서 4.18로 내려온다 — 0.32 차이를 §11.6이 일부러 만든
  // 세 면의 단차가 먹는다. 레퍼런스 정합이 고른 색이라(25-reference.css §액센트)
  // 이 테스트가 바꿀 값이 아니고, 바꾼다면 그 문서에서 바꿀 일이다.
  "light/blue | --accent on --bg-app": 4.18,

  // ── 나머지 26줄은 하나의 원인이다 ──────────────────────────────────────────
  // `01-base.css:533-536`의 네 액센트는 Apple 시스템 색이고, 고를 당시 그것들은
  // '면'이었다 — 점 하나, 채워진 체크박스 하나. 레퍼런스 정합이 액센트를 글자와
  // 포커스 윤곽으로도 쓰기 시작했고(`color: var(--accent)` 73곳,
  // `outline: 2px solid var(--ff-focus-ring)`), blue만 #556be7로 갈아끼웠다.
  // 넷은 그때의 값 그대로 남아 새 역할을 맡고 있다.
  //
  // 심각도가 둘로 갈린다. purple·pink는 3.2~4.1로 AA에 못 미치고, green·orange는
  // 1.94~2.22로 **글자가 아닌 것의 3:1(1.4.11)까지** 미달한다 — 포커스 윤곽이
  // 바탕에서 갈라지지 않는다는 뜻이고, 키보드로 쓰는 사람에게는 지금 자기가 어디
  // 있는지 보이지 않는다는 뜻이다.
  //
  // 고치는 방법은 색을 다시 고르는 것뿐이고, 그것은 이 파일의 일이 아니다.
  // blue가 #0064d2 → #556be7로 간 것과 같은 작업을 넷에 하면 이 26줄이 사라진다.
  "light/purple | --accent on --bg-surface": 4.13,
  "light/purple | --accent on --bg-app": 3.82,
  "light/purple | --accent-ink on --accent-soft": 3.56,
  "light/purple | --color-on-dark on --accent-fill": 4.13,

  "light/pink | --accent on --bg-surface": 3.65,
  "light/pink | --accent on --bg-app": 3.37,
  "light/pink | --accent-ink on --accent-soft": 3.17,
  "light/pink | --color-on-dark on --accent-fill": 3.65,

  "light/green | --accent on --bg-surface": 2.22,
  "light/green | --accent on --bg-app": 2.05,
  "light/green | --accent-ink on --accent-soft": 2.01,
  "light/green | --color-on-dark on --accent-fill": 2.22,
  "light/green | --accent-fill on --bg-surface": 2.22,
  "light/green | --ff-blue on --bg-rail": 1.96,
  "light/green | --ff-focus-ring on --bg-surface": 2.22,
  "light/green | --ff-focus-ring on --bg-app": 2.05,
  "light/green | --ff-focus-ring on --bg-rail": 1.96,

  "light/orange | --accent on --bg-surface": 2.2,
  "light/orange | --accent on --bg-app": 2.03,
  "light/orange | --accent-ink on --accent-soft": 2,
  "light/orange | --color-on-dark on --accent-fill": 2.2,
  "light/orange | --accent-fill on --bg-surface": 2.2,
  "light/orange | --ff-blue on --bg-rail": 1.94,
  "light/orange | --ff-focus-ring on --bg-surface": 2.2,
  "light/orange | --ff-focus-ring on --bg-app": 2.03,
  "light/orange | --ff-focus-ring on --bg-rail": 1.94,
};

/** 문맥 이름. 액센트로 값이 갈리지 않는 쌍은 테마 이름만 갖는다. */
function label(ctx: Ctx, accentDependent: boolean): string {
  return accentDependent ? `${ctx.theme}/${ctx.accent}` : ctx.theme;
}

type Measured = { key: string; ratio: number; fg: string; bg: string; pair: Pair };

/**
 * 쌍 하나를 모든 문맥에서 재되, 값이 같은 문맥은 한 번만 남긴다.
 *
 * 액센트 다섯을 늘 펼치면 표가 다섯 배가 되고, 그중 넷은 `--text-primary`처럼
 * 액센트와 무관한 쌍의 같은 숫자다. 같은 숫자를 다섯 줄로 적어두면 다음 사람이
 * 그 표를 읽지 않는다.
 */
function measure(pair: Pair): Measured[] {
  const out: Measured[] = [];

  for (const theme of THEMES) {
    const resolved = ACCENTS.map((accent) => {
      const tokens = tokensFor({ theme, accent });
      return {
        accent,
        fg: resolve(`var(${pair.fg})`, tokens),
        bg: resolve(`var(${pair.bg})`, tokens),
        over: pair.over ? resolve(`var(${pair.over})`, tokens) : undefined,
      };
    });

    const first = resolved[0];
    const accentDependent = resolved.some(
      (r) => r.fg !== first.fg || r.bg !== first.bg || r.over !== first.over,
    );
    const seen = new Set<string>();

    for (const r of resolved) {
      const signature = `${r.fg}|${r.bg}|${r.over}`;
      if (!accentDependent && seen.size > 0) break;
      if (seen.has(signature)) continue;
      seen.add(signature);

      const fg = parseColor(r.fg);
      const bg = parseColor(r.bg);
      const over = r.over ? parseColor(r.over) : null;
      if (!fg || !bg) {
        throw new Error(
          `색으로 읽히지 않는다: ${pair.fg}=${r.fg} / ${pair.bg}=${r.bg} (${theme}/${r.accent}).\n` +
            `토큰이 지워졌거나 이름이 바뀌었으면 contrast.test.ts의 표에서도 지워라.`,
        );
      }

      // 바탕이 반투명하면 그 뒤의 불투명한 면 위에 먼저 얹는다. 그 다음에야
      // 글자가 그 위에 온다 — 순서를 바꾸면 알파가 두 번 섞인다.
      const solidBg = over ? composite(bg, over) : bg;
      out.push({
        key: `${label({ theme, accent: r.accent }, accentDependent)} | ${pair.fg} on ${pair.bg}`,
        ratio: contrast(composite(fg, solidBg), solidBg),
        fg: r.fg,
        bg: r.bg,
        pair,
      });
    }
  }

  return out;
}

describe("토큰 대비 (WCAG 2.2 AA)", () => {
  const measured = ALL_PAIRS.flatMap(measure);

  it.each(measured.map((m) => [m.key, m] as const))("%s", (_key, m) => {
    const floor = KNOWN[m.key];

    if (floor === undefined) {
      if (m.ratio < m.pair.target) {
        throw new Error(
          `${m.key} = ${m.ratio} (필요 ${m.pair.target}).\n` +
            `  앞: ${m.pair.fg} → ${m.fg}\n` +
            `  뒤: ${m.pair.bg} → ${m.bg}\n` +
            `  자리: ${m.pair.why}\n` +
            `색을 고치거나, 지금 값을 근거와 함께 KNOWN에 적어라:\n` +
            `  "${m.key}": ${m.ratio},`,
        );
      }
      return;
    }

    if (m.ratio >= m.pair.target) {
      throw new Error(
        `${m.key} = ${m.ratio}로 ${m.pair.target}을 넘었다. KNOWN에서 그 줄을 지워라 —\n` +
          `남겨두면 다시 미달로 돌아가도 이 자리가 통과한다.`,
      );
    }

    if (m.ratio < floor) {
      throw new Error(
        `${m.key}: ${floor} → ${m.ratio}로 나빠졌다.\n` +
          `  앞: ${m.pair.fg} → ${m.fg}\n` +
          `  뒤: ${m.pair.bg} → ${m.bg}\n` +
          `  자리: ${m.pair.why}`,
      );
    }

    if (m.ratio > floor) {
      throw new Error(
        `${m.key}: ${floor} → ${m.ratio}로 좋아졌다. KNOWN을\n` +
          `  "${m.key}": ${m.ratio},\n로 올려라 — 그래야 이 자리가 다시 내려갈 때 잡힌다.`,
      );
    }
  });

  it("KNOWN에 재지 않는 쌍이 남아 있지 않다", () => {
    const keys = new Set(measured.map((m) => m.key));
    expect(Object.keys(KNOWN).filter((key) => !keys.has(key))).toEqual([]);
  });

  /**
   * 표의 토큰은 살아 있다.
   *
   * 죽은 토큰을 재면 고칠 것이 없는 실패가 뜨고(`--bg-sidebar`가 그랬다), 반대로
   * 이름이 바뀐 토큰은 `미정의(...)`가 되어 조용히 넘어간다. 둘 다 표를 믿을 수
   * 없게 만든다. 그래서 두 가지를 확인한다 — 라이트 문맥에서 값으로 풀릴 것,
   * 그리고 CSS 어딘가가 실제로 그 토큰을 부를 것.
   */
  it("표에 적힌 토큰은 선언되어 있고, 부르는 곳이 있다", () => {
    const tokens = tokensFor({ theme: "light", accent: "blue" });
    const barrel = readFileSync(join(HERE, "..", "styles.css"), "utf8");
    const css = [...barrel.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)]
      .map((m) => readFileSync(join(HERE, m[1]), "utf8"))
      .join("\n");

    const dead: string[] = [];
    for (const name of new Set(ALL_PAIRS.flatMap((p) => [p.fg, p.bg, ...(p.over ? [p.over] : [])]))) {
      if (resolve(`var(${name})`, tokens).startsWith("미정의(")) dead.push(`${name}: 선언이 없다`);
      else if (!css.includes(`var(${name})`)) dead.push(`${name}: 부르는 곳이 없다`);
    }

    expect(dead).toEqual([]);
  });
});
