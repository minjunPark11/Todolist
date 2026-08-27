// The rule that makes the rest of this layer possible, enforced instead of
// intended.
//
// `src/server/**` runs where there is no browser: no localStorage, no
// `navigator`, no `import.meta.env`, no React. Every one of those reaches it
// the same way — not by being written here, but by being imported by
// something that is imported by something written here. A comment cannot stop
// that. This walks the actual import graph and fails the moment a device
// crosses the line.
//
// It also names WHY each thing is banned, because the fix differs: a platform
// import means the module needs splitting (as `domain/today/dailyPlan` did),
// while `import.meta` means the module was written for Vite and needs a
// process.env path instead.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const SERVER = resolve(__dirname);

const BANNED_MODULES: Array<{ match: (path: string) => boolean; why: string }> = [
  {
    match: (path) => path.startsWith(resolve(SRC, "platform")),
    why: "platform is a device (localStorage, the file system, a tray icon). A server has none of it.",
  },
  {
    match: (path) => path.startsWith(resolve(SRC, "services", "supabaseClient")),
    why: "that client reads import.meta.env and holds a browser session. The server builds its own per request.",
  },
  {
    match: (path) => path.startsWith(resolve(SRC, "hooks")),
    why: "a hook is React, and React is a renderer.",
  },
];

const BANNED_SPECIFIERS = ["react", "react-dom", "framer-motion", "@supabase/supabase-js"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) specifiers.push(match[1]);
  return specifiers;
}

function resolveLocal(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Next candidate.
    }
  }
  return null;
}

/** Every module the server layer reaches, however many hops away. */
function importClosure(entries: string[]): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = entries.map((entry) => ({ file: entry, path: [entry] }));

  while (queue.length > 0) {
    const { file, path } = queue.shift() as { file: string; path: string[] };
    if (seen.has(file)) continue;
    seen.set(file, path);
    for (const specifier of importsOf(file)) {
      const resolved = resolveLocal(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push({ file: resolved, path: [...path, resolved] });
    }
  }
  return seen;
}

function show(path: string[]): string {
  return path.map((file) => relative(SRC, file).replace(/\\/g, "/")).join(" → ");
}

describe("the server layer stays runnable without a browser", () => {
  const entries = walk(SERVER).filter((file) => !file.endsWith(".test.ts"));
  const closure = importClosure(entries);

  it("reaches no module that needs a device", () => {
    const violations: string[] = [];
    for (const [file, path] of closure) {
      for (const banned of BANNED_MODULES) {
        if (banned.match(file)) violations.push(`${show(path)}\n    ${banned.why}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("imports no browser-only package", () => {
    const violations: string[] = [];
    for (const [file, path] of closure) {
      for (const specifier of importsOf(file)) {
        if (BANNED_SPECIFIERS.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`))) {
          violations.push(`${show(path)} imports "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("reads no import.meta", () => {
    const violations: string[] = [];
    for (const [file, path] of closure) {
      if (/\bimport\.meta\b/.test(readFileSync(file, "utf8"))) violations.push(show(path));
    }
    expect(violations).toEqual([]);
  });

  it("names no service_role key", () => {
    // §22-9 as a test rather than as a CI grep, so it fails where it is cheap
    // to notice. The repository's runtime guard is the second half of this.
    const violations = [...closure.keys()].filter((file) =>
      /SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE/i.test(readFileSync(file, "utf8")),
    );
    expect(violations.map((file) => relative(SRC, file))).toEqual([]);
  });
});
