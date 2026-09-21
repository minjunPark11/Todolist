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
 * `sdv-*`도 같은 자리다 — 기능 스타일이 아니라 컴포넌트 언어의 별칭이고, 그
 * 스펙이 "`.ff-btn`과 같은 것"이라는 불변식으로 지킨다. 지우면 테스트가 함께
 * 바뀌므로 별도 판단이다.
 */
const KEEP: { pattern: RegExp; why: string }[] = [
  { pattern: /^ff-card$/, why: "새 카드가 집어야 할 정본 이름 (componentLanguage.spec.ts)" },
  { pattern: /^ff-field$/, why: "정본 필드 — 같은 스펙이 불변식으로 지킨다" },
  { pattern: /^sdv-(btn|metric-card)/, why: "컴포넌트 언어의 별칭 — componentLanguage · verticalRhythm이 참조한다" },
];

/**
 * 아직 0이 아닌 파일과, 그 숫자.
 *
 * 은퇴한 기능의 잔해가 대부분이다 — `05-spaces`는 Spaces가, `03-planning`과
 * `02-calendar`는 보드/매트릭스의 옛 화면이 빠지면서 남았다.
 *
 * 갚는 것은 파일별로, 그 파일을 만지는 커밋에서. 숫자를 늘리는 것은 답이 아니다.
 */
const CEILING: Record<string, number> = {
  "01-base.css": 6,
  "02-calendar.css": 8,
  "03-planning.css": 34,
  "05-spaces.css": 33,
  "08-calendar-categories.css": 22,
  "09-calendar-redesign.css": 7,
  "10-calendar-apple.css": 1,
  "12-timeline.css": 9,
  "17-tasks-module.css": 6,
  "18-schedule-editor.css": 2,
  // `.foc-header` 하나다. CSS 다섯 파일이 그것을 꾸미는데 그리는 컴포넌트가 없다 —
  // 앞선 손계산에서는 살아 있는 것으로 셌었다. `scale.test.ts`의 **주석**이 그
  // 이름을 적고 있었기 때문이다. 호출부를 셀 때 테스트를 빼는 이유가 그것이다.
  "20-density.css": 1,
  "21-components.css": 25,
  "24-focus.css": 4,
  "25-reference.css": 2,
};

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
