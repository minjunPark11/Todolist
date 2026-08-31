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
});
