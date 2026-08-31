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
import { readFileSync } from "node:fs";
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
