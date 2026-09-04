// The priority palette exists twice, and this is what keeps the copies equal.
//
// `PRIORITY_COLOR` has to be TypeScript: `readableInkOn` weighs a real colour
// to pick the block's ink, and it cannot weigh `var(--priority-high)`. The
// stylesheet has to keep the tokens: everything else that draws a priority —
// the row checkbox, the flag — reads them from there.
//
// Two copies of a value drift. This reads the stylesheet and fails when they
// have, which is cheaper than either a build step or a bug that ships a title
// nobody can read.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIORITY_COLOR } from "./itemColor";

const BASE_CSS = fileURLToPath(new URL("../../styles/01-base.css", import.meta.url));

function tokenValue(css: string, name: string): string | null {
  // The first definition wins: `:root` declares the light palette before any
  // theme block redefines anything, and the priority tokens are not themed.
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  return match ? match[1].toLowerCase() : null;
}

describe("the priority palette", () => {
  const css = readFileSync(BASE_CSS, "utf8");

  it.each([
    ["priority-high", "high"],
    ["priority-medium", "medium"],
    ["priority-low", "low"],
  ] as const)("matches --%s in 01-base.css", (token, key) => {
    expect(tokenValue(css, token)).toBe(PRIORITY_COLOR[key].toLowerCase());
  });

  // `--priority-none` is an alias (`var(--text-tertiary)`), not a literal, so
  // the check is against what that resolves to rather than against the alias.
  it("matches --text-tertiary for the level that has no colour of its own", () => {
    expect(tokenValue(css, "text-tertiary")).toBe(PRIORITY_COLOR.none.toLowerCase());
  });
});
