// 고아 셀렉터 (DRIFT_GUARD_DESIGN.md §4 G3).
//
// `componentLanguage.spec.ts`가 규칙을 먼저 적어 뒀다 — *"별칭은 어딘가에서
// 불려야 그 줄을 얻는다."* 그 규칙으로 `.sdv-card`를 포함한 여덟 이름이 이미
// 지워졌다. 여기는 그것을 파일 단위가 아니라 **셀렉터 단위로** 자동화한다.
//
// 왜 필요했나. Goals · Projects · Spaces가 `RETIRED_ROUTES`로 빠지면서 화면만
// 사라지고 CSS는 남았다 — 다섯 파일 1,278줄이 번들에 실려 다녔고, 아무 테스트도
// 그것을 말하지 않았다. 파일을 지우고 나서도 `.ovs-card-head` 둘이
// `21-components.css`에 흘러들어 남아 있었다. 파일 단위로만 감사했기 때문이다.
//
// **0에서 시작할 수 없다.** 지금 160개다(손계산 155는 틀렸다 — §6-2). 그래서 `scale.test.ts`가 407곳에서
// 시작할 때 쓴 방법을 그대로 쓴다 — 총합 하나가 아니라 **파일당 천장 하나.**
// 그 파일의 주석이 이유를 적어 뒀다: 한 개의 총합은 "화면 하나를 지우면 무관한
// 작업이 숫자를 움직인다"는 이유로 다음 사람을 세운다. 파일별 숫자는 서로를
// 밀지 않으며, 하나씩 0이 되면 목록에서 빠진다.
//
// 천장은 빚이다. 늘리는 것이 아니라 줄이는 방향으로만 움직인다 — 아래 두 번째
// 테스트가 그것을 강제한다.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

/**
 * 호출부가 없어도 남는 이름과, 그 이유.
 *
 * **이유 없이는 올릴 수 없다.** `componentLanguage.spec.ts`가 `.ff-card`를 두고
 * 적어 둔 것이 이 목록의 성격을 말한다 — *"`.ff-card`는 호출부가 없어도 남는다.
 * 새 카드가 집어야 할 이름이기 때문이다. 무엇이 그것을 정직하게 지키느냐면, 이
 * 파일의 마지막 테스트가 정본 이름들로 화면을 만들어 각각이 무언가를 그리는지
 * 검사한다."*
 *
 * `sdv-*`가 한때 여기 있었다. 같은 자리처럼 보였지만 아니었다 — `.ff-card`는
 * **새 카드가 집어야 할 이름**이고, `.sdv-btn`은 사라진 화면이 쓰던 **옛 이름**
 * 이었다. 그 별칭의 유일한 독자가 "그 별칭이 `.ff-btn`과 같다"고 단언하는
 * 테스트뿐이면 그것은 호출부가 아니라 고리다. 스타일시트와 스펙에서 함께
 * 지웠다 — `.sdv-card`를 포함한 여덟 이름이 이미 그렇게 갔던 그대로.
 */
const KEEP: { pattern: RegExp; why: string }[] = [
  { pattern: /^ff-card$/, why: "새 카드가 집어야 할 정본 이름 (componentLanguage.spec.ts)" },
  { pattern: /^ff-field$/, why: "정본 필드 — 같은 스펙이 불변식으로 지킨다" },
];

/**
 * 아직 0이 아닌 파일과, 그 숫자.
 *
 * **비어 있다.** 160개로 시작했고 한 번에 갚았다 — 셀렉터 1,538줄이 은퇴한 기능의
 * 잔해였기 때문이다. `foc-*` 33개는 `focus-*`로 다시 지어진 Focus의 옛 마크업이고,
 * `pjh-*`와 `fdm-*`는 Projects와 폴더 매니저, `eis-*`는 매트릭스, `board-*`는 옛
 * 보드다. 섬세한 작업이 아니라 삭제였다.
 *
 * 그때부터 이 파일이 지키는 것은 천장이 아니라 불변식이다 — `styles.css`가 부르는
 * 모든 CSS의 모든 클래스는 어딘가에서 불린다. 새 고아가 들어오면 여기 숫자를 적는
 * 것이 아니라, 지우거나 KEEP에 이유를 적는 것이 답이다(`scale.test.ts`가 CEILING을
 * 비우며 못박은 그대로).
 */
const CEILING: Record<string, number> = {};

function loadedFiles(): string[] {
  const css = readFileSync(join(root, "src", "styles.css"), "utf8");
  return [...css.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);
}

/** `.tsx`/`.ts` 어딘가에 이 문자열이 있는가 — 템플릿 조립까지 잡으려는 느슨한 검사다. */
function callSites(): string {
  const chunks: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        chunks.push(readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(root, "src"));
  return chunks.join("\n");
}

const SOURCE = callSites();

function orphansIn(file: string): string[] {
  const css = readFileSync(join(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  const classes = new Set<string>();
  for (const m of css.matchAll(/^\.([a-zA-Z][\w-]*)/gm)) classes.add(m[1]);
  return [...classes]
    .filter((c) => !KEEP.some((k) => k.pattern.test(c)))
    .filter((c) => !SOURCE.includes(c))
    .sort();
}

describe("고아 셀렉터 (DRIFT_GUARD §4 G3)", () => {
  it.each(loadedFiles())("%s — 천장을 넘지 않는다", (file) => {
    const orphans = orphansIn(file);
    const ceiling = CEILING[file] ?? 0;
    expect(
      orphans.length,
      ceiling === 0
        ? `호출부 없는 클래스: ${orphans.join(" ")}`
        : `천장 ${ceiling} → 지금 ${orphans.length}. 넘으면 숫자를 늘리는 것이 아니라 지우거나 KEEP에 이유를 적는다: ${orphans.join(" ")}`,
    ).toBeLessThanOrEqual(ceiling);
  });

  it("천장은 빚이다 — 실제보다 크면 줄여 적는다", () => {
    // 고친 뒤 숫자를 안 내리면 그만큼의 빚이 조용히 되살아난다. `scale.test.ts`가
    // "하나씩 0이 되면 목록에서 빠진다"고 한 것을 강제하는 자리다.
    const slack = Object.entries(CEILING)
      .map(([file, ceiling]) => ({ file, ceiling, now: orphansIn(file).length }))
      .filter(({ ceiling, now }) => now < ceiling)
      .map(({ file, ceiling, now }) => `${file}: 천장 ${ceiling} → ${now}로 내린다`);
    expect(slack).toEqual([]);
  });

  it("천장 목록에 없는 파일은 0이다", () => {
    const unlisted = loadedFiles()
      .filter((f) => !(f in CEILING))
      .map((f) => ({ f, n: orphansIn(f).length }))
      .filter(({ n }) => n > 0)
      .map(({ f, n }) => `${f}: ${n}`);
    expect(unlisted).toEqual([]);
  });

  it("천장 목록이 실재하는 파일만 싣는다", () => {
    // 파일을 지웠는데 천장 줄이 남으면, 그 줄은 아무것도 지키지 않으면서 빚처럼
    // 보인다. 다섯 파일을 지운 커밋이 정확히 그런 줄을 남길 뻔했다.
    const loaded = new Set(loadedFiles());
    expect(Object.keys(CEILING).filter((f) => !loaded.has(f))).toEqual([]);
  });

  it("KEEP은 이유를 갖고, 전부 쓰이고 있다", () => {
    expect(KEEP.filter((k) => !k.why.trim()).map((k) => String(k.pattern))).toEqual([]);
    // 쓰이지 않는 예외는 지운다 — 다음 사람이 그것을 승인된 패턴으로 읽는다.
    const allClasses = new Set<string>();
    for (const file of loadedFiles()) {
      const css = readFileSync(join(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      for (const m of css.matchAll(/^\.([a-zA-Z][\w-]*)/gm)) allClasses.add(m[1]);
    }
    const unused = KEEP.filter((k) => ![...allClasses].some((c) => k.pattern.test(c))).map((k) =>
      String(k.pattern),
    );
    expect(unused).toEqual([]);
  });
});
