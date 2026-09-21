// 산문이 숫자를 말할 때 (DRIFT_GUARD_DESIGN.md §4 G4).
//
// 이 세션에서 내가 직접 만든 어긋남이다. `design.md` §9-1이
//
//     CSS에는 `max-width: 600 / 639 / 680 / 720 / 768 / 900px` 브레이크포인트가 …
//
// 라고 적고 있었다. 쓸 때는 맞았다. 그 뒤에 내가 `720`이 들어 있던 파일 셋을
// 지웠고, 문서를 같이 고치지 않았다. 같은 날 `styles.css`의 주석도 근거를
// 과장했다 — 다섯 접두사가 "`src/` 전체에서 0회"라고 했는데 실제로 잰 것은
// `.tsx`/`.ts`뿐이었고, CSS에는 `.ovs-card-head`가 남아 있었다.
//
// 없앨 수 있는 중복은 없앤다(G1이 대비 수치에 한 일이 그것이다). 그러나 산문이
// 숫자를 말해야 하는 자리가 있다 — 근거를 설명하는 자리다. 그때는 표식을 달고
// 여기가 읽는다.
//
//     <!--@ breakpoints.narrow -->600 · 639 · 680 · 768 · 900<!--@-->
//
// **표식이 없는 산문은 검사하지 않는다.** 도입 비용이 0이어야 하고, 거짓 실패가
// 쌓이면 아무도 읽지 않기 때문이다(§7).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const stylesDir = join(root, "src", "styles");

/** 주석은 개행만 남기고 같은 길이의 공백으로 — offset이 밀리면 줄 번호가 거짓말을 한다. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

function loadedStyleFiles(): string[] {
  const css = readFileSync(join(root, "src", "styles.css"), "utf8");
  return [...css.matchAll(/@import\s+"\.\/styles\/([^"]+)"/g)].map((m) => m[1]);
}

function mediaMaxWidths(): number[] {
  const out: number[] = [];
  for (const file of loadedStyleFiles()) {
    const clean = stripCssComments(readFileSync(join(stylesDir, file), "utf8"));
    for (const rule of clean.matchAll(/@media\b([^{]*)\{/g)) {
      for (const w of rule[1].matchAll(/max-width:\s*(\d+)px/g)) out.push(Number(w[1]));
    }
  }
  return out;
}

/** `:root`에서 토큰 하나를 풀어 hex로. `contrast.test.ts`와 같은 해석이다. */
function tokenValue(name: string): string | null {
  const css = readFileSync(join(stylesDir, "25-reference.css"), "utf8");
  const open = /:root\s*\{/.exec(css);
  if (!open) return null;
  let depth = 1;
  let i = open.index + open[0].length;
  const from = i;
  for (; i < css.length && depth > 0; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
  }
  const body = stripCssComments(css.slice(from, i - 1));
  const vars = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
  const seen = new Set<string>();
  let cur: string | undefined = name;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const raw: string | undefined = vars.get(cur);
    if (!raw) return null;
    const ref = /^var\(\s*(--[\w-]+)/.exec(raw);
    if (!ref) return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
    cur = ref[1];
  }
  return null;
}

type Shape = "numbers" | "hex";
type Claim = { shape: Shape; of: (arg: string) => string[]; what: string };

/**
 * 표식이 부를 수 있는 이름.
 *
 * 셋이면 시작에 충분하다 — §1.4의 두 건이 첫째와 셋째였다. 늘리는 것은 쉽지만,
 * 늘리기 전에 먼저 물을 것이 있다: 그 사실을 **산문에서 지울 수는 없나.**
 * 지울 수 있으면 표식이 아니라 삭제가 답이다(§3.1).
 */
const CLAIMS: Record<string, Claim> = {
  "breakpoints.narrow": {
    shape: "numbers",
    what: "좁은 폭(≤900px) @media max-width 값",
    of: () => [...new Set(mediaMaxWidths().filter((w) => w <= 900))].sort((a, b) => a - b).map(String),
  },
  "breakpoints.narrow.count": {
    shape: "numbers",
    what: "좁은 폭 @media 규칙의 수",
    of: () => [String(mediaMaxWidths().filter((w) => w <= 900).length)],
  },
  "orphans.count": {
    shape: "numbers",
    what: "호출부 없는 클래스의 총수 (orphans.test.ts의 천장 합계)",
    of: () => {
      const css = readFileSync(join(stylesDir, "orphans.test.ts"), "utf8");
      // `= {};` 한 줄짜리 빈 형태도 읽어야 한다 — 빚을 다 갚으면 그 모양이 되고,
      // 못 읽으면 추출기가 빈 배열을 돌려 "문서 [0] vs 코드 []"로 어긋난다.
      const block = /const CEILING: Record<string, number> = \{([\s\S]*?)\};/.exec(css);
      if (!block) return [];
      const sum = [...block[1].matchAll(/:\s*(\d+),/g)].reduce((a, m) => a + Number(m[1]), 0);
      return [String(sum)];
    },
  },
  "styles.count": {
    shape: "numbers",
    what: "`styles.css`가 부르는 CSS 파일 수",
    of: () => [String(loadedStyleFiles().length)],
  },
  token: {
    shape: "hex",
    what: "`:root`의 토큰 값",
    of: (arg) => {
      const v = tokenValue(arg);
      return v ? [v] : [];
    },
  },
};

// 인자는 식별자로 한정한다. `(\S+)`였을 때 `-->`까지 삼켜서, 한 줄에 표식이 둘
// 있으면 첫 여는 표식이 둘째 표식까지 하나로 먹었다 — 본문에 남의 숫자가 섞여
// 들어오고 닫힘 검사도 어긋났다. `--text-meta`처럼 `-->` 앞에 공백이 있는 자리만
// 우연히 맞아서, 표식을 한 줄에 둘 적기 전까지 드러나지 않았다.
const MARKER = /<!--@\s*([\w.]+)(?:\s+([\w.-]+))?\s*-->([\s\S]*?)<!--@-->/g;

function markdownFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(full, acc);
    else if (entry.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

function found(text: string, shape: Shape): string[] {
  const hits =
    shape === "hex"
      ? [...text.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase())
      : [...text.matchAll(/\d+/g)].map((m) => m[0]);
  return [...new Set(hits)].sort();
}

type Marked = { file: string; line: number; name: string; arg: string; body: string };

/**
 * 코드 안은 주장이 아니라 예시다 — 펜스도, 인라인 백틱도.
 *
 * 두 번 물렸다. `DRIFT_GUARD_DESIGN.md` §4 G4가 표식의 생김새를 보여주려고
 * 펜스 안에 `<!--@ breakpoints -->…`를 적어 뒀고 그것이 "없는 이름"으로 잡혔다.
 * 고치고 나서, §4.4.1이 산문 한가운데서 인라인 백틱으로 여는 표식만 언급하자
 * 이번엔 "닫히지 않았다"로 잡혔다.
 *
 * **문서가 자기 장치를 설명하는 일은 앞으로도 있다.** 그래서 코드 표기는 전부
 * 비운다 — 줄 번호를 지키려고 개행만 남긴다.
 */
function stripCode(md: string): string {
  return md
    .replace(/^```[\s\S]*?^```/gm, (b) => b.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (b) => b.replace(/[^\n]/g, " "));
}

function markedClaims(): Marked[] {
  const out: Marked[] = [];
  for (const file of markdownFiles(root)) {
    const text = stripCode(readFileSync(file, "utf8"));
    if (!text.includes("<!--@")) continue;
    for (const m of text.matchAll(MARKER)) {
      out.push({
        file: relative(root, file),
        line: text.slice(0, m.index).split("\n").length,
        name: m[1],
        arg: m[2] ?? "",
        body: m[3],
      });
    }
  }
  return out;
}

describe("산문의 주장 (DRIFT_GUARD §4 G4)", () => {
  it("표식이 부르는 이름이 전부 존재한다", () => {
    const unknown = markedClaims()
      .filter((c) => !(c.name in CLAIMS))
      .map((c) => `${c.file}:${c.line} <!--@ ${c.name} -->`);
    expect(unknown, `쓸 수 있는 이름: ${Object.keys(CLAIMS).join(" · ")}`).toEqual([]);
  });

  it("표식이 감싼 숫자가 코드와 같다", () => {
    const wrong = markedClaims()
      .filter((c) => c.name in CLAIMS)
      .map((c) => {
        const claim = CLAIMS[c.name];
        const said = found(c.body, claim.shape);
        const real = [...claim.of(c.arg)].sort();
        return { c, said, real };
      })
      .filter(({ said, real }) => said.join(",") !== real.join(","))
      .map(
        ({ c, said, real }) =>
          `${c.file}:${c.line} ${c.name}${c.arg ? ` ${c.arg}` : ""} — 문서 [${said.join(" ")}] vs 코드 [${real.join(" ")}] (${CLAIMS[c.name].what})`,
      );
    expect(wrong, "산문이 낡았다 — 문서를 고치거나, 그 사실을 산문에서 지운다").toEqual([]);
  });

  it("표식이 백틱 안에 갇혀 있지 않다", () => {
    // 조용히 검사에서 빠진 표식이 가장 나쁘다 — 있는 줄 알았던 가드가 없는 상태다.
    // §4.4.1에 첫 `token` 표식을 달면서 문장째 인라인 백틱으로 감쌌고, 값을 일부러
    // 틀리게 바꿔도 통과했다. 그때 알았다.
    //
    // 설명하려고 **여는 표식만** 적는 것(`<!--@ token -->` 같은)은 정상이다.
    // 백틱 안에 **짝이 온전히** 들어 있으면 그건 예시가 아니라 갇힌 표식이다 —
    // 예시는 펜스에 적는다.
    const trapped: string[] = [];
    for (const file of markdownFiles(root)) {
      const raw = readFileSync(file, "utf8");
      if (!raw.includes("<!--@")) continue;
      const noFence = raw.replace(/^```[\s\S]*?^```/gm, (b) => b.replace(/[^\n]/g, " "));
      for (const m of noFence.matchAll(/`[^`\n]*`/g)) {
        if (MARKER.test(m[0])) {
          MARKER.lastIndex = 0;
          trapped.push(
            `${relative(root, file)}:${noFence.slice(0, m.index).split("\n").length} ${m[0].trim()}`,
          );
        }
      }
    }
    expect(trapped, "백틱을 벗기면 검사된다 — 예시로 보여줄 것이면 펜스에 적는다").toEqual([]);
  });

  it("표식은 닫혀 있다", () => {
    // 여는 표식 수와 전체 짝의 수가 다르면 어딘가가 `<!--@-->`를 잃었고, 그 블록은
    // 조용히 검사에서 빠진다 — 있는 줄 알았던 가드가 없는 상태가 가장 나쁘다.
    const broken: string[] = [];
    for (const file of markdownFiles(root)) {
      const text = stripCode(readFileSync(file, "utf8"));
      const opens = (text.match(/<!--@\s*[\w.]/g) ?? []).length;
      const pairs = [...text.matchAll(MARKER)].length;
      if (opens !== pairs) broken.push(`${relative(root, file)}: 여는 표식 ${opens} · 짝 ${pairs}`);
    }
    expect(broken).toEqual([]);
  });
});
