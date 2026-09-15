// 토큰이 선언한 것과 스타일시트가 실제로 하는 것 사이의 틈.
//
// 두 가지를 본다. 둘 다 같은 모양의 결함이다 — 주석이 규칙을 적어뒀는데 그 규칙을
// 지키는 눈이 없어서, 코드가 조용히 주석 밖으로 걸어 나간 자리.
//
//   ① 선언됐지만 아무도 읽지 않는 커스텀 프로퍼티
//   ② `--bp-*` 가 "반드시 이 5개만 사용한다"고 적어둔 중단점 사다리
//
// ①에 대한 이 파일의 입장: **안 읽히는 것이 곧 죽은 것은 아니다.** 이 리포에는
// 읽히지 않는 채로 남아 있어야 하는 토큰이 여러 무리 있고, 각각 이유가 주석에
// 적혀 있다 — 척도의 완결성(z 여덟 단), 문서·JS 참조용(`--bp-*`), 목업을 옮겨
// 적는 정합 레이어(25-reference.css), 삼조 팔레트(`--tint-*`). 그래서 이 테스트는
// 지우라고 말하지 않는다. **목록을 고정한다.** 새 이름이 이 목록에 들어오면
// 잡히고, 이유가 없으면 그때 지우면 된다.
//
// 이 자를 세우면서 실제로 지운 것은 넷뿐이었다 — `--color-surface-black`,
// `--font-page-title`, `--font-section-title`, `--sdv-accent`. 계약이 적혀 있지
// 않은 별칭들이다. 나머지 43개는 이유가 있어서 남았다. 확신 없는 삭제는 아끼는
// 것보다 비싸다.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

function allFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) allFiles(path, out);
    else out.push(path);
  }
  return out;
}

/* ─────────────────────────── ① 읽히지 않는 토큰 ─────────────────────────── */

/**
 * 읽히지 않아도 남아 있는 이름과, 남아 있는 이유.
 *
 * 이유를 한 줄로 못 적겠으면 그 토큰은 지울 때가 된 것이다.
 */
const UNREAD: Record<string, string> = {
  // §19.5 의 여덟 단 중 마지막 하나. 나머지 넷(`--z-tooltip`·`--z-popover`·
  // `--z-menu`·`--z-overlay`)은 리터럴 28곳을 옮기면서 실제로 불리게 돼 이
  // 목록에서 빠졌다 — 이 장부가 예고한 그대로다.
  //
  // `--z-base: 0` 만 남는다. 0 은 "아무것도 하지 않는다"라서 부를 일이 거의
  // 없지만, 사다리의 바닥이 이름을 갖고 있어야 나머지 일곱이 무엇 위에 선
  // 것인지 읽힌다.
  "--z-base": "겹침 척도의 바닥",

  // CSS 변수는 `@media` 조건식에 못 들어간다. 01-base.css 가 그것을 알고 적어둔
  // 값이고, 스타일시트는 숫자를 직접 쓰되 이 다섯만 쓰기로 돼 있다 — 아래 ②가
  // 그 약속을 지킨다.
  "--bp-xs": "@media 가 var() 를 못 읽는다 (문서·JS 참조용)",
  "--bp-sm": "@media 가 var() 를 못 읽는다 (문서·JS 참조용)",
  "--bp-md": "@media 가 var() 를 못 읽는다 (문서·JS 참조용)",
  "--bp-lg": "@media 가 var() 를 못 읽는다 (문서·JS 참조용)",
  "--bp-xl": "@media 가 var() 를 못 읽는다 (문서·JS 참조용)",

  // "Event / category tints (tinted bg + readable text + accent bar)" — 색마다
  // 세 팔을 가진 팔레트다. 오늘 소비되는 것은 `-text` 셋뿐이지만, 팔레트에서
  // 안 쓰는 팔만 뽑아내면 남는 셋이 임의로 보인다.
  "--tint-blue-bg": "삼조 팔레트",
  "--tint-blue-text": "삼조 팔레트",
  "--tint-blue-accent": "삼조 팔레트",
  "--tint-purple-bg": "삼조 팔레트",
  "--tint-purple-text": "삼조 팔레트",
  "--tint-purple-accent": "삼조 팔레트",
  "--tint-green-bg": "삼조 팔레트",
  "--tint-green-accent": "삼조 팔레트",
  "--tint-orange-bg": "삼조 팔레트",
  "--tint-orange-accent": "삼조 팔레트",
  "--tint-red-bg": "삼조 팔레트",
  "--tint-red-accent": "삼조 팔레트",

  // 25-reference.css 는 목업의 실측값을 토큰으로 **옮겨 적는** 정합 레이어다
  // (그 파일 머리주석 §5). 아직 소비되지 않은 전사는 찌꺼기가 아니다.
  "--placeholder": "레퍼런스 전사 (25-reference.css)",
  "--badge-sync": "레퍼런스 전사 (25-reference.css)",
  "--dot-list": "레퍼런스 전사 (25-reference.css)",
  "--shadow-drawer": "레퍼런스 전사 (25-reference.css)",
  "--shadow-sheet": "레퍼런스 전사 (25-reference.css)",
  "--t-hint": "레퍼런스 전사 (25-reference.css)",
  "--w-normal": "레퍼런스 전사 (25-reference.css)",
  // 이 둘은 `contrast.test.ts` 가 이미 주석으로 죽었다고 적어둔 이름이다 — 가드가
  // 그 기록을 독립적으로 다시 찾았다. `--focus-ring`(반투명)은 선언만 있고 실제로
  // 그려지는 색은 `--ff-focus-ring` 이며, `--bg-sidebar` 는 유일한 독자였던
  // `--ff-sidebar` 를 이번에 끊으면서 01-base.css 에서는 사라졌다. 레퍼런스 쪽
  // 전사만 남는다.
  "--focus-ring": "레퍼런스 전사 (25-reference.css)",
  "--bg-sidebar": "레퍼런스 전사 (25-reference.css)",

  // 26-timeline.css §4.2 가 "리스트 색이 없는 행의 폴백"이라고 결정을 적어뒀다.
  "--schedule-bg": "§4.2 의 폴백 색",
  "--schedule-text": "§4.2 의 폴백 색",
  "--selected-bg": "§4.2 의 폴백 색",
  "--selected-text": "§4.2 의 폴백 색",
  "--shadow-float": "26-timeline.css 의 그림자 한 벌",

  // "이 넷은 이미 타입 6단 위에 있었다" — 값이 아니라 자를 가리키는 한 벌이다.
  "--density-font-sm": "밀도 한 벌 (§11.2)",
  "--density-font-lg": "밀도 한 벌 (§11.2)",
  "--density-section-title": "밀도 한 벌 (§11.2)",
  "--density-card-gap": "밀도 한 벌 (§11.2)",

  // "The single allowed drop-shadow" — 제약을 적어둔 이름이다. 지우면 제약이
  // 사라지고, 다음 사람은 그림자를 새로 발명한다.
  "--product-shadow": "허용된 유일한 드롭섀도라는 제약",

  // 01-base.css 의 옛 이름들. `--label-size` 옆 주석이 이 파일의 규칙을 적어뒀다
  // — "부르는 곳이 있으면 남긴다". 이 넷은 부르는 곳이 사라진 뒤에도 남아 있다.
  // 지우려면 09-calendar-redesign.css 계열이 무엇을 쓰는지 한 번 훑어야 해서
  // 여기 적어두고 따로 본다.
  "--ff-card-shadow": "옛 이름 — 따로 훑어야 함",
  "--ff-heading": "옛 이름 — 따로 훑어야 함",
  "--ff-input": "옛 이름 — 따로 훑어야 함",
  "--ff-subtle": "옛 이름 — 따로 훑어야 함",
};

function tokenLedger(): { declared: Set<string>; read: Set<string> } {
  const files = allFiles(SRC).concat(allFiles(join(SRC, "..", "e2e")));
  const declared = new Set<string>();
  const read = new Set<string>();

  for (const file of files) {
    if (!/\.(css|ts|tsx|html)$/.test(file)) continue;
    // 검사 파일은 사용처가 아니다. 이 파일만 해도 `UNREAD` 의 키를 문자열로
    // 들고 있어서, 세지 않으면 목록에 적힌 이름이 전부 "읽히는 중"으로 보인다 —
    // 장부가 자기를 읽고 스스로 비어 있다고 말하는 꼴이다. 같은 이유로 토큰을
    // 이름으로 부르는 다른 테스트(contrast.test.ts 등)도 빼는 쪽이 맞다:
    // 테스트만 부르는 토큰은 앱이 쓰는 토큰이 아니다.
    if (/\.(test|spec)\.(ts|tsx)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".css")) {
      // 줄머리를 요구하지 않는다. `.x { --y: 1px; }` 처럼 한 줄에 쓴 규칙의
      // 선언을 놓치면, 그 자리에 죽은 이름을 넣어도 장부가 조용하다 [실측].
      // 앞 글자로 거른다: `var(--y)` 는 `(` 뒤라 걸리지 않고, 애초에 뒤에 콜론이
      // 오지도 않는다.
      for (const m of text.matchAll(/(?:^|[;{}\s])(--[a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]);
    }
    for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) read.add(m[1]);
    // TS 가 `setProperty("--x", …)` / `getPropertyValue("--x")` 로 이름을 부르는 경우.
    for (const m of text.matchAll(/["'`](--[a-zA-Z0-9-]+)["'`]/g)) read.add(m[1]);
  }
  return { declared, read };
}

describe("읽히지 않는 토큰", () => {
  it("목록에 없는 이름이 새로 생기지 않는다", () => {
    const { declared, read } = tokenLedger();
    const unlisted = [...declared].filter((name) => !read.has(name) && !(name in UNREAD)).sort();

    expect(
      unlisted,
      `선언만 되고 아무도 읽지 않는 토큰이 생겼다. 지우거나, 남길 이유를 한 줄로\n` +
        `적어 tokens.test.ts 의 UNREAD 에 넣어라:\n${unlisted.map((n) => `  ${n}`).join("\n")}`,
    ).toEqual([]);
  });

  it("목록의 이름이 다시 읽히면 목록에서 빠진다", () => {
    const { declared, read } = tokenLedger();
    const revived = Object.keys(UNREAD).filter((name) => read.has(name)).sort();
    const gone = Object.keys(UNREAD).filter((name) => !declared.has(name)).sort();

    expect(
      [...revived, ...gone],
      `UNREAD 가 실제와 어긋난다.\n` +
        (revived.length ? `  다시 읽히는 중 (항목을 지워라): ${revived.join(", ")}\n` : "") +
        (gone.length ? `  선언이 사라짐 (항목을 지워라): ${gone.join(", ")}` : ""),
    ).toEqual([]);
  });
});

/* ──────────────────────────── ② 중단점 사다리 ──────────────────────────── */

/**
 * 01-base.css 의 `--bp-*` 가 적어둔 다섯 단.
 *
 * 거기 주석은 "반드시 이 5개만 사용한다"고 말한다. 지키는 눈이 없었고, 실제로는
 * 뷰포트 폭 18종이 쓰이고 있었다 [실측].
 */
const LADDER = [640, 768, 900, 1120, 1240];

/**
 * 한 칸 옆은 사다리 위다.
 *
 * `max-width: 767px` 은 `min-width: 768px` 의 짝이고 `min-width: 901px` 은
 * `max-width: 900px` 의 짝이다. 경계를 나누는 두 질의가 같은 단을 가리키므로
 * ±1 은 드리프트가 아니라 문법이다.
 */
const onLadder = (w: number) => LADDER.some((step) => Math.abs(w - step) <= 1);

/** 아직 사다리 밖인 `@media` 선언의 수. 0 이 목표다. */
const OFF_LADDER: Record<string, number> = {
  "03-planning.css": 2,
  "08-calendar-categories.css": 1,
  "13-list-view.css": 1,
  "14-scope-calendar.css": 1,
  "15-goals-section.css": 1,
  "16-overview-section.css": 2,
  "17-tasks-module.css": 2,
  "19-app-shell.css": 3,
  "26-timeline.css": 4,
  "27-calendar.css": 1,
};

/**
 * `@media` 안의 뷰포트 폭만 센다.
 *
 * `@container` 의 폭은 뷰포트가 아니라 부모 상자의 폭이므로 이 사다리가 다스리는
 * 대상이 아니다 — 이 리포에는 40px·72px·104px·130px 같은 값이 거기 있고, 그것들은
 * 아이콘 레일이나 접힌 열의 폭이다.
 */
function offLadder(css: string): { line: number; width: number; query: string }[] {
  const found: { line: number; width: number; query: string }[] = [];
  for (const m of css.matchAll(/@media\b[^{]*/g)) {
    const line = css.slice(0, m.index).split("\n").length;
    for (const w of m[0].matchAll(/(?:min|max)-width:\s*([0-9.]+)px/g)) {
      const width = Number(w[1]);
      if (!onLadder(width)) found.push({ line, width, query: m[0].replace(/\s+/g, " ").trim() });
    }
  }
  return found;
}

function stylesheets(): string[] {
  const barrel = readFileSync(join(SRC, "styles.css"), "utf8");
  return [...barrel.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);
}

describe("중단점 사다리 (01-base.css --bp-*)", () => {
  const listed = Object.keys(OFF_LADDER).sort();

  it.each(listed)("%s — 사다리 밖 @media 가 늘지 않는다", (name) => {
    const found = offLadder(readFileSync(join(HERE, name), "utf8"));
    const ceiling = OFF_LADDER[name];

    if (found.length > ceiling) {
      throw new Error(
        `${name}: 사다리 밖 ${found.length}곳 (천장 ${ceiling}).\n` +
          `다섯 단(${LADDER.join(" · ")}) 중 하나로 맞추거나, 이 폭이어야 하는 이유를\n` +
          `주석으로 남기고 천장을 올려라.\n` +
          found
            .slice(ceiling)
            .map((f) => `  ${name}:${f.line}  ${f.width}px  ${f.query.slice(0, 60)}`)
            .join("\n"),
      );
    }

    if (found.length < ceiling) {
      throw new Error(
        `${name}: ${ceiling} → ${found.length}로 줄었다. tokens.test.ts 의 OFF_LADDER 를\n` +
          `  "${name}": ${found.length},\n로 내려라 — 그래야 이 자리가 다시 늘 때 잡힌다.`,
      );
    }
  });

  it("목록에 없는 스타일시트는 사다리 위에 있다", () => {
    const unlisted = stylesheets()
      .filter((name) => !(name in OFF_LADDER))
      .map((name) => [name, offLadder(readFileSync(join(HERE, name), "utf8")).length] as const)
      .filter(([, count]) => count > 0);

    expect(unlisted).toEqual([]);
  });
});
