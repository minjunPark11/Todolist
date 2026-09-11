// 자를 지키는 것 (SWISS_MINIMAL_DESIGN.md §7).
//
// §7은 처음에 전역 기준선 하나를 제안했다 — CSS 전부에서 스케일 밖 리터럴을 세고
// 그 숫자보다 늘면 실패. `i18n/catalogue.test.ts`가 이미 그 패턴을 기각해 뒀다:
// 한 개의 총합은 "화면 하나를 지우면 무관한 작업이 숫자를 움직인다"는 이유로
// 다음 사람을 세운다. 그 반론은 0에서 죽는다.
//
// 처음엔 0이 될 수 없었다 — Phase 2 시점에 407곳이 남아 있었다. 그래서 총합 하나가
// 아니라 파일당 하나를 잠갔다. 파일은 Phase 3의 커밋 단위였고(§8), 파일별 숫자는
// 서로를 밀지 않으며, 하나씩 0이 되면 목록에서 빠지게 했다.
//
// **지금 그 목록은 비어 있다.** 19개 파일이 모두 0이고, 이 파일이 지키는 것은 이제
// 천장이 아니라 catalogue.test.ts가 말한 그 불변식이다: `styles.css`가 부르는 모든
// CSS는 자 위에 있다. 새 위반이 들어오면 숫자를 적는 것이 아니라, 고치거나 EXEMPT에
// 이유를 적는 것이 답이다.
//
// 세는 것은 셋이다 — 선언 안의 리터럴, 토큰의 정의(§8.2에서 그 사이로 20px과 10px이
// 빠져나갔다), 그리고 셀렉터에 붙은 예외. 화면에 도달한 모양을 재는 쪽은
// `e2e/radiusScale.spec.ts`이고, 그쪽은 이 grep이 못 보는 것을 본다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** §5.1의 스케일. 10px은 예외가 아니라 최소 단이다(--type-2xs, §14). */
const SIZE_OK = new Set(["11px", "12px", "13px", "15px", "18px", "24px", "10px", "inherit", "0", "100%"]);
/** §5.2의 3단. 로드되는 페이스가 셋뿐이다. */
const WEIGHT_OK = new Set(["400", "600", "700", "inherit", "normal", "bold", "initial"]);
/** I1-B의 단일값. 50%/100%/9999px은 모서리가 아니라 원이다. */
const RADIUS_OK = new Set(["0", "4px", "50%", "100%", "9999px", "inherit", "initial", "unset"]);

/**
 * 간격의 사다리 (§11).
 *
 * 6과 10이 여기 있는 것은 드리프트를 봐주는 것이 아니라 §11.1의 결정이다 — 이 앱은
 * 2px 단위로 돌고 `20-density.css`가 그 위에 서 있으며, 8/12로 올리면 태스크 행이
 * 14% 높아져 문서가 정한 "compact productivity density"에서 멀어진다.
 *
 * 1·2·3은 헤어라인과 광학 보정이다. `--icon-glyph`와 `--display-*`를 타입 스케일에서
 * 뺀 것과 같은 자리 — "얼마나 떨어뜨릴까"가 아니라 "선이 몇 px인가"의 문제다.
 */
const SPACE_OK = new Set([
  "0", "1px", "2px", "3px", "4px", "6px", "8px", "10px", "12px", "16px", "24px", "32px", "48px",
  "auto", "inherit", "initial", "unset", "100%", "50%",
]);

/**
 * 리듬이 아니라 다른 요소의 높이에 묶인 값들 (§11.2).
 *
 * 떠 있는 바를 피하는 여백과 고정 헤더 상쇄, 그리고 뷰포트를 따라 자라는 페이지
 * 패딩이다. 사다리에 얹으면 콘텐츠가 그 바 뒤로 들어간다.
 */
/**
 * 모션의 자 (§15).
 *
 * 지속시간은 토큰에서만 온다. `0s`는 지속시간이 아니라 `visibility`를 전환이
 * 끝난 뒤로 미루는 장치이므로 남는다.
 *
 * 이징은 `ease-out` 하나다 — 맨 `ease`가 16곳에 있었는데 토큰은 처음부터
 * `ease-out`이었다. 셸 레이아웃의 `cubic-bezier(0.2, 0, 0, 1)`와 스피너의
 * `linear`는 각자 이유가 있는 곡선이라 남긴다.
 */
const MOTION_DUR_OK = new Set(["0s"]);
const MOTION_EASE_OK = new Set(["ease-out", "linear", "cubic-bezier(0.2,0,0,1)"]);

const SPACE_ANCHORED = new Set(["40px", "42px", "44px", "52px", "64px", "68px", "80px", "90px", "110px"]);

/**
 * 자가 둘인 이유 (POLISHED_REFERENCE_PARITY_DESIGN.md §4.5).
 *
 * 레퍼런스 정합 레이어는 위의 자를 다섯 축에서 전부 벗어난다 — 13.5px, 굵기 540,
 * 반경 6px, 간격 9px, 맨 `ease`. 처음엔 두 목록을 합쳐서 한 자를 넓히려 했다.
 * 그게 틀린 이유는 세보면 나온다: 레퍼런스 목록에 15·18·24px과 4px, 32·48px이
 * 없는데 기존 파일에는 그 값들이 43곳 살아 있다. 합치면 자가 21단이 되고, 그
 * 순간부터 이 테스트는 아무것도 막지 못한다 — §7이 "문서만으로는 안 지켜진다"고
 * 적어둔 그 상태로 정확히 돌아간다.
 *
 * 그래서 넓히는 대신 나눈다. 파일마다 자가 하나씩 있고, 둘 다 무관용이다:
 * 레퍼런스 파일에 15px이 들어와도 잡히고, Calendar에 13.5px이 들어와도 잡힌다.
 * 마이그레이션 경계가 이 표에 적히는 것은 부수 효과다 — 나중에 한 파일을
 * 레퍼런스로 옮기면 아래 `REFERENCE_FILES`에 한 줄 더하면 된다.
 */
const REFERENCE = {
  size: new Set([
    "10px", "10.5px", "11px", "11.5px", "12px", "12.5px", "13px", "13.5px",
    "13.6px", "14px", "17px", "20px", "23px", "25px",
    "inherit", "0", "100%",
  ]),
  weight: new Set(["400", "520", "540", "550", "600", "650", "680", "700", "750", "inherit", "normal", "bold", "initial"]),
  radius: new Set(["0", "3px", "5px", "6px", "8px", "9px", "12px", "50%", "100%", "9999px", "inherit", "initial", "unset"]),
  space: new Set([
    "0", "1px", "2px", "3px", "4px", "5px", "6px", "7px", "8px", "9px", "10px",
    "11px", "12px", "13px", "14px", "16px", "18px", "22px", "24px", "26px", "28px", "34px",
    "auto", "inherit", "initial", "unset", "100%", "50%",
  ]),
  // 레퍼런스는 거의 모든 전환에 맨 `ease`를 쓴다. 스위스 쪽 `ease-out`과 달리
  // 이건 값 하나가 아니라 곡선의 선택이고, 목업이 고른 곡선이 그것이다.
  ease: new Set(["ease", "ease-out", "linear", "cubic-bezier(0.2,0,0,1)"]),
} as const;

const LEGACY = {
  size: SIZE_OK,
  weight: WEIGHT_OK,
  radius: RADIUS_OK,
  space: SPACE_OK,
  ease: MOTION_EASE_OK,
} as const;

type Ruler = { size: ReadonlySet<string>; weight: ReadonlySet<string>; radius: ReadonlySet<string>; space: ReadonlySet<string>; ease: ReadonlySet<string> };

/** 레퍼런스 자로 재는 파일. 한 줄이 한 번의 마이그레이션이다. */
const REFERENCE_FILES = new Set(["25-reference.css"]);

function rulerFor(name: string): Ruler {
  return REFERENCE_FILES.has(name) ? REFERENCE : LEGACY;
}

// offset도 blur도 0인 box-shadow는 그림자가 아니라 링이다 — 포커스 링과
// 헤어라인이 이 모양으로 그려진다. I2-B가 걷어내는 것은 흐림이 만든 가짜
// 깊이이지 링이 아니고, 포커스 링은 접근성이라 애초에 협상 대상이 아니다.
const RING = /^(inset\s+)?0\s+0\s+0\s/;

/**
 * 스케일 밖에 남는 자리와, 그것에 주어진 이유.
 *
 * `e2e/radiusScale.spec.ts`의 ALLOWED_OFF_SCALE과 같은 장치이고 같은 이유다 —
 * 적어두지 않은 예외가, 여섯 개짜리 스케일이 스무 개로 돌아가는 방법이다.
 *
 * **비어 있다.** 하나 있었다: 로그인 화면(`.auth-`)은 유기적 블롭과 색을 가진
 * 그림자와 유동 히어로 타이포를 지고 있었고, 그것을 옮기는 일은 정리가 아니라
 * 리디자인이라 예외로 뒀다. 그 리디자인을 했으므로(§9) 줄을 지운다.
 *
 * 예외를 지우는 것이 예외를 늘리는 것보다 낫다. 다만 파일당 숫자와 달리 이쪽은
 * 셀렉터에 붙으므로, 정말 다른 언어로 그려야 하는 화면이 생기면 이유와 함께
 * 여기 한 줄을 적는 것이 옳은 답이다.
 */
const EXEMPT: { selector: RegExp; why: string }[] = [
  // 잘린 막대의 끝은 각져야 한다 — 12-timeline.css가 §D4의 이유를 적어놨다:
  // "온전해 보이는 막대는 3일짜리 작업으로 읽힌다". 2px은 모서리를 둥글게 하는
  // 값이 아니라 반대로 각지게 만드는 신호이고, 화살표 글리프와 짝이다.
  { selector: /\.ff-timeline-bar\.is-clipped-/, why: "잘린 끝은 각진다 (12-timeline.css §D4)" },
  // `margin-left: -7px`은 바로 위 `width: 14px`의 절반이다 — 45° 회전한 마커를
  // 오늘 선 위에 앉히는 파생값이고, 사다리가 아니라 그 width를 따라간다.
  // §11.3에서 이것을 드리프트로 착각해 -6으로 스냅했다가 되돌렸다.
  // 스피너는 전환이 아니라 루프다 — 1.1s는 한 바퀴 도는 시간이고 사다리와 무관하다.
  { selector: /\.rail-sync\.is-syncing/, why: "루프 애니메이션 (SWISS_MINIMAL_DESIGN.md §15)" },
  // 두 가지가 스케일 밖이고 둘 다 이유가 적혀 있다: `margin-left: -7px`은 위
  // `width: 14px`의 절반(파생값)이고, `border-radius: 3px`은 §11.39가 형태라고
  // 부르는 20px 아래의 마름모라 반경 스케일이 다스리는 곳이 아니다. 이행이 그
  // 3px을 덮었다가 되돌렸다 (§16).
  { selector: /\.ff-timeline-bar\.is-marker/, why: "파생값과 20px 아래의 마름모 (§11.3 · §16)" },
];

/**
 * 아직 0이 아닌 파일과, 그 숫자.
 *
 * **비어 있다.** Phase 3이 19개 파일을 모두 0으로 만들었고, 그때부터 이 테스트가
 * 지키는 것은 천장이 아니라 불변식이다 — `styles.css`가 부르는 모든 CSS는 자 위에
 * 있다(아래 두 번째 테스트). 새 파일이 위반을 들고 들어오면 여기 숫자를 적는 것이
 * 아니라, 그 위반을 고치거나 EXEMPT에 이유를 적는 것이 답이다.
 */
const CEILING: Record<string, number> = {};

type Violation = { line: number; kind: string; text: string };

/**
 * var(...)를 통째로 지운 뒤 남는 리터럴만 본다. 토큰을 부르는 자리는 통과다.
 *
 * 안쪽부터 벗기는 이유: `var(--a, var(--b))`처럼 폴백이 또 토큰인 자리가 있고,
 * 한 번만 지우면 바깥 괄호의 `)` 하나가 리터럴로 남아 위반으로 세어진다.
 * Phase 3 첫 파일에서 `var(--radius-sm, 6px)`의 폴백까지 토큰으로 바꿨다가
 * 15곳이 그렇게 유령으로 잡혔다 — 값은 옳은데 세는 쪽이 틀렸던 경우다.
 */
function literals(declaration: string): string[] {
  // `!important`는 값이 아니라 우선순위다. 빼두지 않으면 `var(--type-md) !important`가
  // 토큰을 부르고도 위반으로 잡힌다 — 06-space-detail.css에서 실제로 그렇게 잡혔다.
  let stripped = declaration.replace(/!\s*important/gi, " ");
  for (let guard = 0; stripped.includes("var(") && guard < 10; guard += 1) {
    stripped = stripped.replace(/var\([^()]*\)/g, " ");
  }
  return stripped.split(/[\s,/]+/).filter(Boolean);
}

/**
 * 이름이 자기가 무엇을 재는지 말해주는 토큰과, 그것을 재는 자.
 *
 * 선언 안의 리터럴만 세는 것으로는 부족하다. `20-density.css`는 화면의 상당수를
 * `var(--density-title)` · `var(--density-radius)`로 덮고 있었고, 그 이름 뒤에서
 * 20px과 10px이 자를 벗어나 있었다 — 파일은 위반 0곳으로 통과했고, 브라우저에서
 * `.foc-header h1`을 재보고서야 드러났다 (§8.2).
 *
 * `glyph`와 `display`는 일부러 빠져 있다. 그 둘은 타입 6단을 따르는 것이 아니라
 * 자기가 스스로 자다(`--icon-glyph` 16px · `--display-md` 34px).
 * `title(?!bar)`는 `--titlebar-h`가 창 크롬의 높이이지 글자 크기가 아니기 때문이다.
 */
function tokenScale(name: string, ruler: Ruler): ReadonlySet<string> | null {
  if (name.includes("radius") || name.startsWith("--r-")) return ruler.radius;
  // `--w-` 접두사가 `title`보다 먼저 온다. 레퍼런스 레이어는 굵기를 자리 이름으로
  // 부르는데(`--w-title: 700`), 아래 heuristic이 그 "title"을 보고 크기 토큰으로
  // 읽어 700을 위반으로 잡았다 — 이름이 틀린 것이 아니라 읽는 쪽이 틀렸다.
  if (name.includes("weight") || name.startsWith("--w-")) return ruler.weight;
  if (name.startsWith("--t-")) return ruler.size;
  if (/font|title(?!bar)|size/.test(name)) return ruler.size;
  return null;
}

function scan(css: string, ruler: Ruler = LEGACY): Violation[] {
  // 주석은 지우되 줄 수는 남긴다 — 줄번호가 있어야 고칠 곳을 짚어준다.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length));
  const found: Violation[] = [];

  let selector = "";

  source.split("\n").forEach((line, index) => {
    const at = index + 1;

    // 셀렉터는 자기 줄에 온다(이 리포의 포매팅). 뒤따르는 선언들이 그것에 속한다.
    if (line.includes("{")) selector = line.slice(0, line.indexOf("{")).trim() || selector;
    if (EXEMPT.some((exempt) => exempt.selector.test(selector))) return;
    // `@font-face`의 `font-weight: 100 900`은 굵기를 고르는 것이 아니라 이 폰트가
    // 그려낼 수 있는 범위를 적는 서술자다. 가변 폰트를 들이면서 드러난 틈이고,
    // 자가 다스리는 곳이 아니다 (POLISHED_REFERENCE_PARITY_DESIGN.md §4.1).
    if (selector.startsWith("@font-face")) return;

    for (const [property, allowed, kind] of [
      ["border-radius", ruler.radius, "radius"],
      ["font-size", ruler.size, "size"],
      ["font-weight", ruler.weight, "weight"],
    ] as const) {
      const hit = new RegExp(String.raw`(?<![-\w])${property}\s*:\s*([^;{}]+)`).exec(line);
      if (hit && literals(hit[1]).some((value) => !allowed.has(value))) {
        found.push({ line: at, kind, text: hit[1].trim() });
      }
    }

    // 롱핸드도 본다. `border-top-left-radius`에는 `border-radius`라는 문자열이
    // 없어서 위 루프가 지나친다 — 타임라인의 잘린 막대가 그 틈으로 2px을 그리고
    // 있었고, 화면을 재다가 나왔다(§12). 노출은 네 곳이었지만 틈은 틈이다.
    const longhand = /(?<![-\w])border-(?:top|bottom)-(?:left|right)-radius\s*:\s*([^;{}]+)/.exec(line);
    if (longhand && literals(longhand[1]).some((value) => !ruler.radius.has(value))) {
      found.push({ line: at, kind: "radius", text: longhand[0].trim() });
    }

    const shadow = /(?<![-\w])box-shadow\s*:\s*([^;{}]+)/.exec(line);
    if (shadow) {
      const value = shadow[1].trim();
      if (value !== "none" && !value.includes("var(") && !RING.test(value)) {
        found.push({ line: at, kind: "shadow", text: value });
      }
    }

    // 간격. §11이 스냅한 133곳이 다시 흘러가는 것을 막는다 — 그 전까지 이 축에는
    // 가드가 없었고, §7이 "문서만으로는 안 지켜진다"고 적어둔 그대로였다.
    const space = /(?<![-\w])(?:padding|margin|gap|row-gap|column-gap|(?:padding|margin)-(?:top|right|bottom|left|inline|block))\s*:\s*([^;{}]+)/.exec(line);
    if (space) {
      const bad = literals(space[1]).filter(
        (value) => /^-?[\d.]+(px|rem|em)$/.test(value) && !ruler.space.has(value.replace(/^-/, "")) && !SPACE_ANCHORED.has(value.replace(/^-/, "")),
      );
      if (bad.length) found.push({ line: at, kind: "space", text: `${space[0].trim().slice(0, 46)}  ← ${bad.join(" ")}` });
    }

    // 모션.
    const motion = /(?<![-\w])(?:transition|animation)(?:-duration)?\s*:\s*([^;{}]+)/.exec(line);
    if (motion) {
      const value = motion[1];
      const durations = [...value.matchAll(/(?<![\w.])([\d.]+m?s)/g)].map((m) => m[1]);
      const bad = durations.filter((d) => !MOTION_DUR_OK.has(d));
      const eases = [...value.matchAll(/(?<![-\w])(ease-in-out|ease-out|ease-in|ease|linear|cubic-bezier\([^)]*\))/g)]
        .map((m) => m[1].replace(/\s+/g, ""));
      const badEase = eases.filter((e) => !ruler.ease.has(e));
      // 이징을 적지 않으면 CSS 기본값이 `ease`다 — 적어둔 `ease`를 걷어내면서
      // 생략을 놔두면 같은 곡선이 이름 없이 남는다. `.overlay-scrollbar`가
      // 정확히 그렇게 통과하고 있었다 (§15).
      const omitted = durations.length > 0 && eases.length === 0 ? ["이징 생략"] : [];
      if (bad.length || badEase.length || omitted.length) {
        found.push({ line: at, kind: "motion", text: `${value.trim().slice(0, 40)}  ← ${[...bad, ...badEase, ...omitted].join(" ")}` });
      }
    }

    // 토큰의 정의 자체. 값이 한 덩어리인 것만 본다 — `600 24px/32px …` 같은 축약형은
    // 안에 line-height가 섞여 있어 크기로 읽으면 틀린다.
    const token = /^\s*(--[\w-]+)\s*:\s*([^;{}]+);\s*$/.exec(line);
    if (token) {
      const allowed = tokenScale(token[1], ruler);
      const value = token[2].trim();
      if (allowed && /^[\d.]+(px|rem|em)?$/.test(value) && !allowed.has(value)) {
        found.push({ line: at, kind: "token", text: `${token[1]}: ${value}` });
      }
    }
  });

  return found;
}

describe("스위스 스케일 (SWISS_MINIMAL_DESIGN.md §5)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = Object.keys(CEILING).sort();

  it.skipIf(files.length === 0).each(files)("%s — 스케일 밖 리터럴이 늘지 않는다", (name) => {
    const violations = scan(readFileSync(join(here, name), "utf8"), rulerFor(name));
    const ceiling = CEILING[name];

    if (violations.length > ceiling) {
      const added = violations
        .slice(ceiling)
        .map((v) => `  ${name}:${v.line}  ${v.kind}: ${v.text}`)
        .join("\n");
      throw new Error(
        `${name}: 스케일 밖 리터럴 ${violations.length}곳 (천장 ${ceiling}).\n` +
          `토큰(--type-* / --weight-* / --radius-* / --shadow-*)을 쓰거나, 이 값이 옳다면\n` +
          `근거를 주석으로 남기고 CEILING을 올려라.\n${added}`,
      );
    }

    if (violations.length < ceiling) {
      throw new Error(
        `${name}: ${ceiling} → ${violations.length}로 줄었다. scale.test.ts의 CEILING을\n` +
          `  "${name}": ${violations.length},\n로 내려라 — 그래야 이 자리가 다시 늘 때 잡힌다.`,
      );
    }
  });


  it("목록에 없는 CSS 파일은 0이다", () => {
    const all = readFileSync(join(here, "..", "styles.css"), "utf8")
      .matchAll(/@import\s+"\.\/styles\/([^"]+)"/g);
    const unlisted = [...all]
      .map((m) => m[1])
      .filter((name) => !(name in CEILING))
      .map((name) => [name, scan(readFileSync(join(here, name), "utf8"), rulerFor(name)).length] as const)
      .filter(([, count]) => count > 0);

    expect(unlisted).toEqual([]);
  });
});
