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

/** §5.1의 6단. 10px은 --label-size의 기록된 예외(01-base.css). */
const SIZE_OK = new Set(["11px", "12px", "13px", "15px", "18px", "24px", "10px", "inherit", "0", "100%"]);
/** §5.2의 3단. 로드되는 페이스가 셋뿐이다. */
const WEIGHT_OK = new Set(["400", "600", "700", "inherit", "normal", "bold", "initial"]);
/** I1-B의 단일값. 50%/100%/9999px은 모서리가 아니라 원이다. */
const RADIUS_OK = new Set(["0", "4px", "50%", "100%", "9999px", "inherit", "initial", "unset"]);

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
const EXEMPT: { selector: RegExp; why: string }[] = [];

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
function tokenScale(name: string): Set<string> | null {
  if (name.includes("radius")) return RADIUS_OK;
  if (name.includes("weight")) return WEIGHT_OK;
  if (/font|title(?!bar)|size/.test(name)) return SIZE_OK;
  return null;
}

function scan(css: string): Violation[] {
  // 주석은 지우되 줄 수는 남긴다 — 줄번호가 있어야 고칠 곳을 짚어준다.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length));
  const found: Violation[] = [];

  let selector = "";

  source.split("\n").forEach((line, index) => {
    const at = index + 1;

    // 셀렉터는 자기 줄에 온다(이 리포의 포매팅). 뒤따르는 선언들이 그것에 속한다.
    if (line.includes("{")) selector = line.slice(0, line.indexOf("{")).trim() || selector;
    if (EXEMPT.some((exempt) => exempt.selector.test(selector))) return;

    for (const [property, allowed, kind] of [
      ["border-radius", RADIUS_OK, "radius"],
      ["font-size", SIZE_OK, "size"],
      ["font-weight", WEIGHT_OK, "weight"],
    ] as const) {
      const hit = new RegExp(String.raw`(?<![-\w])${property}\s*:\s*([^;{}]+)`).exec(line);
      if (hit && literals(hit[1]).some((value) => !allowed.has(value))) {
        found.push({ line: at, kind, text: hit[1].trim() });
      }
    }

    const shadow = /(?<![-\w])box-shadow\s*:\s*([^;{}]+)/.exec(line);
    if (shadow) {
      const value = shadow[1].trim();
      if (value !== "none" && !value.includes("var(") && !RING.test(value)) {
        found.push({ line: at, kind: "shadow", text: value });
      }
    }

    // 토큰의 정의 자체. 값이 한 덩어리인 것만 본다 — `600 24px/32px …` 같은 축약형은
    // 안에 line-height가 섞여 있어 크기로 읽으면 틀린다.
    const token = /^\s*(--[\w-]+)\s*:\s*([^;{}]+);\s*$/.exec(line);
    if (token) {
      const allowed = tokenScale(token[1]);
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
    const violations = scan(readFileSync(join(here, name), "utf8"));
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
      .map((name) => [name, scan(readFileSync(join(here, name), "utf8")).length] as const)
      .filter(([, count]) => count > 0);

    expect(unlisted).toEqual([]);
  });
});
