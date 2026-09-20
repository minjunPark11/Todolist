// The two catalogues, as a pair (TICKTICK_MATRIX_DESIGN.md §15 Q5).
//
// Q5 was about orphans — keys left behind when a screen stopped saying what it
// used to say. Counting them is what closed it (§30), and the count is the
// kind of thing that drifts back the moment nobody looks. What is worth a test
// is not the count but the pairing: a key added to one language and forgotten
// in the other is a screen that reads in English for half its readers, and it
// is invisible until someone switches.
//
// Read off the source rather than the modules so a key sitting inside a
// comment or a duplicate literal is counted the way a reader sees it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ko } from "./ko";

const KEY = /^\s*"([^"]+)"\s*:/;

function keysOf(file: string): string[] {
  return readFileSync(new URL(file, import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => KEY.exec(line)?.[1])
    .filter((key): key is string => Boolean(key));
}

describe("the English and Korean catalogues", () => {
  it("define exactly the same keys", () => {
    const english = new Set(Object.keys(en));
    const korean = new Set(Object.keys(ko));

    expect([...english].filter((key) => !korean.has(key))).toEqual([]);
    expect([...korean].filter((key) => !english.has(key))).toEqual([]);
  });

  it("says each key once, so the last line is not quietly the winner", () => {
    for (const file of ["en.ts", "ko.ts"]) {
      const keys = keysOf(file);
      const seen = new Set<string>();
      const twice = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
      expect(twice, `${file} defines a key twice`).toEqual([]);
    }
  });

  it("has no `eis.q*` box titles — the matrix's own keys are the live ones", () => {
    // The orphans Q5 asked about. The boxes are named by `matrix.q*`, which
    // §21 then lets the user overwrite; the `eis.*` titles were the previous
    // screen's and answered to nothing (§30).
    expect(Object.keys(en).filter((key) => /^eis\.q/.test(key))).toEqual([]);
    expect(Object.keys(ko).filter((key) => /^eis\.q/.test(key))).toEqual([]);
  });
});

/**
 * Every key is said somewhere (TICKTICK_MATRIX_DESIGN.md §32).
 *
 * §30.4 declined to test the orphan count and gave the reason: 109 as a
 * passing line would stop the next person the moment they deleted a screen,
 * because deleting a screen RAISES the number before anyone gets to the
 * catalogue. That objection dies at zero. Zero is not a tally, it is the
 * invariant — "a key exists because something says it" — and deleting a
 * screen's keys along with the screen is exactly how it is kept.
 *
 * The scan is the one §30.2 describes, and it has the same bias: a key
 * assembled at runtime (`t(`matrix.q${quadrant}`)`) is credited to its whole
 * prefix family, so a broad prefix like `tasks.` shelters everything under it.
 * That makes this test blind to some orphans. It makes it blind to NONE of
 * the false ones — if a key is reported here, nothing in src or e2e says it.
 */
describe("every key in the catalogue", () => {
  const ROOTS = ["../../src", "../../e2e"];
  const CODE = /\.(ts|tsx|js|jsx)$/;
  const SKIP = /i18n[\\\/](en|ko)\.ts$/;

  function filesUnder(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") filesUnder(full, out);
      } else if (CODE.test(entry.name) && !SKIP.test(full)) {
        out.push(full);
      }
    }
    return out;
  }

  it("is said somewhere outside the catalogue", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const corpus = ROOTS.flatMap((root) => filesUnder(resolve(here, root)))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    // The static head of any `foo.bar${…}` template — one dot required, so a
    // template that merely follows a letter (`` `t${x}` ``) is not mistaken
    // for a namespace that shelters half the catalogue.
    const prefixes = [...corpus.matchAll(/`([A-Za-z]\w*\.[\w.]*?)\$\{/g)].map((m) => m[1]);

    const orphans = Object.keys(en).filter(
      (key) => !corpus.includes(key) && !prefixes.some((prefix) => key.startsWith(prefix)),
    );

    expect(orphans, "no screen says these").toEqual([]);
  });

  /**
   * 그리고 그 반대편.
   *
   * 위 검사는 한 방향만 본다 — 목록에 있는 키를 아무도 말하지 않는 경우(고아).
   * 반대는 보지 않았다: **코드가 말하는데 목록에 없는 키**. `translate` 는
   * 그때 키 자체를 돌려주므로(index.tsx), 화면에는 "calendar.categoryLabel"
   * 같은 문자열이 그대로 나온다. aria-label 이면 스크린 리더가 그것을 읽는다.
   *
   * 실제로 하나 있었다 [실측]: 문자열 리터럴로 쓰인 키 686개 중
   * `calendar.categoryLabel` 하나가 두 목록 어디에도 없었고,
   * `EventPopover.tsx` 의 분류 목록(role="listbox")이 그 이름을 달고 있었다.
   *
   * 여기서는 **문자열 리터럴만** 본다. `` t(`calendar.group.${type}`) `` 처럼
   * 런타임에 조립되는 키는 이 검사가 판단할 수 없고, 위 고아 검사가 접두사로
   * 봐주는 것과 같은 이유다. 그래서 놓치는 것은 있어도, 여기서 나온 것은
   * 전부 진짜다.
   */
  it("exists for every key the code says as a literal", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const said = new Map<string, string>();
    for (const file of ROOTS.flatMap((root) => filesUnder(resolve(here, root)))) {
      for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([^"${}]+)"\s*[,)]/g)) {
        if (!said.has(match[1])) said.set(match[1], file);
      }
    }

    // 자기 점검: 스캐너가 실제로 키를 찾아내야 아래가 무언가를 잰다.
    expect(said.size, "t(\"...\") 를 하나도 못 찾았다면 아래 단언은 빈 목록을 본다").toBeGreaterThan(300);

    const missing = [...said]
      .filter(([key]) => !(key in en) || !(key in ko))
      .map(([key, file]) => `${key} ← ${file.slice(file.indexOf("src"))}`);

    expect(missing, "화면이 이 키를 말하는데 목록에 없다 — 사용자에게 키 문자열이 그대로 보인다").toEqual([]);
  });
});
