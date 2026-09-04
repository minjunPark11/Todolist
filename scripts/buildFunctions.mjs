// Bundles each serverless function into one self-contained file under `api/`.
//
// WHY THIS EXISTS. Vercel does not bundle `api/**/*.ts`: it compiles each file
// on its own, uploads `src/` alongside, and lets Node resolve the relative
// imports at run time. Under ESM — which is what `"type": "module"` in
// package.json makes these — Node supports neither a directory import nor an
// extensionless one, so `../../integrations/google` threw
// ERR_UNSUPPORTED_DIR_IMPORT on every invocation while the build log stayed
// green. tsconfig cannot help: `moduleResolution` governs the compiler, and
// the failure is in the runtime's own resolver.
//
// The alternative was writing `.js` on every relative specifier in the 98
// `src/` files these functions reach — most of `src/domain/**`, shared with the
// app. Bundling here costs one script and touches nothing.
//
// The output is the same shape as `api/ics.js`, which has served correctly
// throughout: a single file with no relative imports left to resolve.
//
// Runs from `npm run build`, which Vercel executes BEFORE it collects
// functions from `api/` — the build log's ordering is what makes generating
// them here work at all.
import { build } from "esbuild";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(root, "src", "functions");
const OUTPUT_DIR = join(root, "api");

/** Every `.ts` under `src/functions`, as paths relative to that directory. */
async function sources(dir = SOURCE_DIR, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const next = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await sources(join(dir, entry.name), next)));
    else if (entry.name.endsWith(".ts")) found.push(next);
  }
  return found;
}

/**
 * Clears what a previous run generated, so a deleted source stops being served.
 *
 * The generated paths are exactly the top-level names in `src/functions` — a
 * directory there becomes a directory here, a file becomes a file. Anything
 * else under `api/` is hand-written (`ics.js`, `calendar/[token].js`) and is
 * never touched, because no source has its name.
 */
async function clearPrevious(names) {
  for (const name of names) {
    await rm(join(OUTPUT_DIR, name), { recursive: true, force: true });
  }
}

const entries = await sources();
if (entries.length === 0) {
  console.error("buildFunctions: no sources in src/functions — refusing to write nothing.");
  process.exit(1);
}

const topLevel = new Set(entries.map((entry) => entry.split("/")[0].replace(/\.ts$/, ".js")));
await clearPrevious(topLevel);
await mkdir(OUTPUT_DIR, { recursive: true });

await build({
  entryPoints: entries.map((entry) => join(SOURCE_DIR, entry)),
  outbase: SOURCE_DIR,
  outdir: OUTPUT_DIR,
  bundle: true,
  platform: "node",
  format: "esm",
  // Vercel's runtime is Node 24; targeting 20 leaves room for it to move down
  // a release without this becoming the reason a deployment breaks.
  target: "node20",
  logLevel: "warning",
});

for (const entry of entries) {
  const out = join(OUTPUT_DIR, entry.replace(/\.ts$/, ".js"));
  const { size } = await stat(out);
  console.log(`  api/${entry.replace(/\.ts$/, ".js")}  ${(size / 1024).toFixed(1)} kB`);
}
console.log(`buildFunctions: ${entries.length} functions bundled.`);
