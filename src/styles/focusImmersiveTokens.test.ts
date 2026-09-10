// 몰입이 덮는 토큰 목록은 페이지가 쓰는 목록과 같아야 한다 (24-focus.css §몰입).
//
// 이 파일이 지키는 것은 값이 아니라 **완결성**이다. `.focus-immersive` 는 어두운 판을
// 깔고 그 위에 같은 페이지를 다시 칠하는데, 다시 칠하는 목록이 페이지가 실제로 쓰는
// 목록보다 짧으면 빠진 토큰은 라이트 테마 값 그대로 어두운 판 위에 그려진다.
//
// 실제로 그렇게 새어나간 적이 있다. §14 가 카드에 `--bg-surface-muted` 를 주었는데
// 몰입 목록에는 그것이 없어서, 라이트 테마의 몰입에서 카드가 #f5f5f7 로 남고 그 위에
// 흰 시계가 얹혔다 — 대비 1.09. 다크 테마에서는 같은 토큰이 #232325 라 문제가 보이지
// 않았으므로, 두 테마 중 하나만 보는 눈으로는 잡히지 않는 종류의 결함이다.
//
// 값이 맞는지는 `e2e/focusImmersive.spec.ts` 가 실제 브라우저에서 잰다. 이 테스트는
// 그 앞에 서서 **빠진 이름**을 잡는다 — grep 은 덮어쓰인 규칙을 못 보지만, 목록에
// 없는 이름은 확실히 본다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "24-focus.css"), "utf8");

/**
 * 테마를 타지 않는 토큰들.
 *
 * 자·리듬·모양·모션은 라이트와 다크가 같은 값을 쓰므로 다시 칠할 것이 없다. 뒤의 둘은
 * 다시 칠하는 쪽이 아니라 **재료**다 — `.focus-immersive` 가 자기 판과 잉크를 만들
 * 때 읽는 값이고, 이름에 이미 "on dark" 와 "tile" 이 들어 있다.
 */
const NOT_A_THEME_SURFACE =
  /^--(?:space|type|radius|weight|display|icon|focus-clock|shadow|motion)-/;
const IMMERSIVE_INPUTS = new Set(["--color-on-dark", "--color-surface-tile-1"]);

/** `.focus-immersive { … }` 선언 블록 하나. */
function immersiveBlock(): string {
  const start = css.indexOf(".focus-immersive {");
  expect(start, "`.focus-immersive` 블록이 있다").toBeGreaterThan(-1);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

describe("몰입이 덮는 토큰 목록 (24-focus.css)", () => {
  it("페이지가 쓰는 표면·잉크 토큰을 하나도 빠뜨리지 않는다", () => {
    const used = new Set(
      Array.from(css.matchAll(/var\((--[a-z0-9-]+)/g), (m) => m[1]).filter(
        (name) => !NOT_A_THEME_SURFACE.test(name) && !IMMERSIVE_INPUTS.has(name),
      ),
    );
    const block = immersiveBlock();
    const remapped = new Set(Array.from(block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm), (m) => m[1]));

    const missing = Array.from(used).filter((name) => !remapped.has(name)).sort();
    expect(
      missing,
      `몰입에서 다시 칠하지 않은 토큰이 있다. 이 값들은 어두운 판 위에 라이트 테마 값으로 그려진다: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("쓰지도 않는 토큰을 덮지 않는다", () => {
    // 목록이 한쪽으로만 자라면 다음 사람은 어느 줄이 아직 살아 있는지 알 수 없다.
    const used = new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)/g), (m) => m[1]));
    const stale = Array.from(immersiveBlock().matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm), (m) => m[1])
      .filter((name) => !used.has(name))
      .sort();
    expect(stale, `이 파일이 쓰지 않는 토큰을 덮고 있다: ${stale.join(", ")}`).toEqual([]);
  });
});
