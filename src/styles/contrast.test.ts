// 대비는 문서가 아니라 여기가 잰다 (DRIFT_GUARD_DESIGN.md §4 G1).
//
// `POLISHED_REFERENCE_PARITY_DESIGN.md` §4.4는 미달 회색 12자리를 4.50~4.54로
// 끌어올린 표를 싣고 있었다. 최소 보정의 증거처럼 보이는 숫자였는데, **흰색 위에서
// 잰 값**이었다. 이 앱의 면은 흰색이 아니다:
//
//     --bg-app  #f6f6f4    --bg-context-sidebar #f8f8f6    --bg-rail #f1f1ef
//
// 실제 면에서 다시 재면 `--text-faint #72777E`는 app 4.17 · rail 3.99로, 흰
// 배경을 뺀 화면 전부에서 §4.4가 세운 4.5:1을 넘지 못했다. 보정을 실제로 받은
// 자리가 하나도 없었던 셈이다(§4.4.1).
//
// 그 표의 숫자는 **토큰에서 계산되는 값**이다. 사람이 한 번 재서 Markdown에
// 적었고, 그 뒤로 아무도 다시 재지 않았다. 그래서 숫자의 정본을 문서에서 여기로
// 옮긴다 — 토큰이 바뀌면 이 파일이 다시 잰다. §4.4의 표는 근거를 설명하는
// 산문으로 남는다.
//
// **천장은 없다.** 지금 트리가 통과하므로 0에서 시작한다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** WCAG 2.x. 본문 4.5:1, 비텍스트(UI 컴포넌트·그래픽) 3:1. */
const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;

/**
 * 일반 텍스트가 놓일 수 있는 면.
 *
 * 가장 어두운 면이 기준이다 — §4.4가 흰색 하나만 보고 통과를 선언한 것이
 * 정확히 그 반대의 실수였다. 특수 짝(`--toast-ink`는 `--toast-bg` 위,
 * 키캡은 `--keycap-bg` 위)은 여기 없고 아래 PAIRS가 따로 잰다.
 */
const SURFACE_TOKENS = [
  "--bg",
  "--bg-app",
  "--bg-rail",
  "--bg-context-sidebar",
  "--bg-sidebar",
  "--bg-surface",
  "--bg-detail",
] as const;

/** 글자를 그리는 토큰 — 4.5:1. */
const TEXT_TOKENS = [
  "--text-primary",
  "--text-task",
  "--text-detail-title",
  "--text-nav",
  "--text-value",
  "--text-secondary",
  "--text-meta",
  "--text-label",
  "--text-rail",
  "--text-faint",
  "--menu-ink",
  "--accent-ink",
] as const;

/**
 * 글자가 아니라 그래픽이라 3:1로 재는 토큰과, 그 근거.
 *
 * §4.4의 예외 2건이 출발점이다 — *"둘 다 글자가 아니라 그래픽이고, 비텍스트
 * 기준은 3:1이며 둘 다 통과한다. 이 둘까지 어둡게 하면 레퍼런스의 가벼움이
 * 실제로 무너진다."* 셋째는 그 뒤에 확인했다.
 *
 * `scale.test.ts`의 EXEMPT와 같은 장치이고 같은 이유다 — 적어두지 않은 예외가,
 * 기준을 무너뜨리는 방법이다.
 */
const GRAPHIC_TOKENS: { token: string; why: string }[] = [
  { token: "--text-prop-icon", why: "속성 행의 아이콘 글리프 (§4.4 예외 1)" },
  { token: "--check-border", why: "체크박스 테두리 (§4.4 예외 2)" },
  { token: "--text-nav-icon", why: "`.tm-row-icon svg`의 색 — 글자가 아니라 아이콘" },
];

/**
 * 기준을 대지 않는 토큰과, 그 이유.
 *
 * **한 줄뿐이고, 늘릴 생각으로 만든 목록이 아니다.**
 *
 * `--hint-glyph`는 `.tm-drawer-prop::after`의 `›` 하나다. `opacity: 0.42`와
 * `pointer-events: none`이 걸려 있고, 행 자체가 이미 눌리는 대상이라 이 글리프가
 * 없어도 무엇을 할 수 있는지는 행이 말한다. WCAG 1.4.11이 장식을 제외하는 자리다.
 *
 * 다만 raw 값 `#8e939a`는 `--bg-rail` 위에서 2.73이고 0.42가 곱해지면 더 내려간다.
 * "장식이니 괜찮다"는 판단이지 통과가 아니므로, 이 줄은 사람이 다시 볼 수 있게
 * 남겨 둔다.
 */
const DECORATIVE: { token: string; why: string }[] = [
  { token: "--hint-glyph", why: "opacity .42의 장식 셰브런 — 행이 이미 어포던스다" },
];

/**
 * 면이 정해져 있는 글자 — 일반 면으로 재면 없는 실패가 나온다.
 *
 * 토스트는 자기 바탕을 들고 다니고(`--toast-bg`), 오류 문구는 카드 위에 선다.
 * 일반 텍스트처럼 "가장 어두운 면"에 대보면 `--toast-ink #ffffff`가 흰 면
 * 위에서 1.0으로 떨어진다 — 화면에 없는 조합이다.
 */
const PAIRS: { ink: string; on: string; why: string }[] = [
  { ink: "--toast-ink", on: "--toast-bg", why: "토스트는 자기 바탕을 들고 다닌다" },
  { ink: "--danger-ink", on: "--bg-surface", why: "오류 문구는 카드 위에 선다 (.ff-settings-msg.is-error)" },
];

function parseBlock(css: string, opener: RegExp): Map<string, string> {
  const start = opener.exec(css);
  if (!start) throw new Error(`블록을 찾지 못했다: ${opener}`);
  let depth = 1;
  let i = start.index + start[0].length;
  const from = i;
  for (; i < css.length && depth > 0; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
  }
  const body = css.slice(from, i - 1).replace(/\/\*[\s\S]*?\*\//g, " ");
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/** `--text-faint: var(--text-meta)`처럼 토큰이 토큰을 부르는 자리를 푼다. */
function resolve(name: string, vars: Map<string, string>, seen = new Set<string>()): string | null {
  if (seen.has(name)) return null;
  seen.add(name);
  const raw = vars.get(name);
  if (!raw) return null;
  const ref = /^var\(\s*(--[\w-]+)/.exec(raw);
  if (ref) return resolve(ref[1], vars, seen);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(join(here, "25-reference.css"), "utf8");
const light = parseBlock(css, /:root\s*\{/);
// 다크는 라이트를 물려받고 일부만 다시 정의한다 — 겹치는 것만 갈아끼운다.
const dark = new Map(light);
for (const [k, v] of parseBlock(css, /\[data-theme="dark"\]\s*\{/)) dark.set(k, v);

const THEMES = [
  { name: "라이트", vars: light },
  { name: "다크", vars: dark },
] as const;

/** 그 테마에서 이 토큰이 가장 낮은 대비를 갖는 면과 그 값. */
function worstSurface(token: string, vars: Map<string, string>) {
  const ink = resolve(token, vars);
  if (!ink) return null;
  let worst: { bg: string; hex: string; ratio: number } | null = null;
  for (const bg of SURFACE_TOKENS) {
    const hex = resolve(bg, vars);
    if (!hex) continue;
    const ratio = contrast(ink, hex);
    if (!worst || ratio < worst.ratio) worst = { bg, hex, ratio };
  }
  return worst && { ink, ...worst };
}

describe("대비 (DRIFT_GUARD §4 G1)", () => {
  it.each(THEMES)("$name — 글자는 가장 어두운 면에서도 4.5:1을 넘는다", ({ vars }) => {
    const under = TEXT_TOKENS.map((token) => ({ token, w: worstSurface(token, vars) }))
      .filter(({ w }) => w && w.ratio < TEXT_MIN)
      .map(({ token, w }) => `${token} ${w!.ink} on ${w!.bg} ${w!.hex} = ${w!.ratio.toFixed(2)}`);
    expect(under, "기준 면은 흰색이 아니라 가장 어두운 면이다 (§4.4.1)").toEqual([]);
  });

  it.each(THEMES)("$name — 그래픽은 3:1을 넘는다", ({ vars }) => {
    const under = GRAPHIC_TOKENS.map(({ token, why }) => ({ token, why, w: worstSurface(token, vars) }))
      .filter(({ w }) => w && w.ratio < GRAPHIC_MIN)
      .map(({ token, why, w }) => `${token} on ${w!.bg} = ${w!.ratio.toFixed(2)} (${why})`);
    expect(under).toEqual([]);
  });

  it.each(THEMES)("$name — 정해진 면 위의 글자도 4.5:1을 넘는다", ({ vars }) => {
    const under = PAIRS.map(({ ink, on, why }) => {
      const [a, b] = [resolve(ink, vars), resolve(on, vars)];
      return a && b ? { ink, on, why, ratio: contrast(a, b) } : null;
    })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.ratio < TEXT_MIN)
      .map((p) => `${p.ink} on ${p.on} = ${p.ratio.toFixed(2)} (${p.why})`);
    expect(under).toEqual([]);
  });

  it("모든 텍스트·그래픽 토큰이 넷 중 한 분류에 들어 있다", () => {
    // 새 회색이 들어왔는데 어느 목록에도 없으면, 이 파일은 그것을 재지 않으면서
    // 통과한다 — §4.4가 흰색 하나만 보고 통과를 선언한 것과 같은 모양의 침묵이다.
    const classified = new Set<string>([
      ...TEXT_TOKENS,
      ...GRAPHIC_TOKENS.map((g) => g.token),
      ...DECORATIVE.map((d) => d.token),
      ...PAIRS.map((p) => p.ink),
    ]);
    const inkish = [...light.keys()].filter(
      (k) => /^--text-|ink$|-glyph$|^--check-border$/.test(k) && !/^--text-tertiary|^--text-muted/.test(k),
    );
    const unclassified = inkish.filter((k) => !classified.has(k) && resolve(k, light));
    expect(unclassified, "새 회색은 TEXT · GRAPHIC · DECORATIVE · PAIRS 중 하나에 이유와 함께 적는다").toEqual([]);
  });

  it("DECORATIVE는 이유를 갖는다", () => {
    expect(DECORATIVE.filter((d) => !d.why.trim())).toEqual([]);
  });
});
