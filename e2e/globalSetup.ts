// Pay for the dev server's first transform before any test is being timed.
//
// Vite compiles on demand: the first page load of a run walks the whole module
// graph and transforms it, which takes far longer than every load after it.
// Playwright's `webServer.url` check only proves the server answers — it does
// not warm anything — so that entire cost landed inside whichever test
// happened to be first, against a 30-second per-test timeout it had no way to
// pay. The result was a suite whose first spec failed for a reason that had
// nothing to do with what it asserts, and passed on re-run.
//
// Warming here puts the cost where no assertion is watching.
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Generous on purpose: this is the compile, and a slow CI runner doing it
    // for the first time is not a failure.
    await page.goto(`${baseURL}/today`, { waitUntil: "load", timeout: 180_000 });
    // The app having actually rendered, not merely the document having loaded:
    // the modules that matter are the ones behind the first screen.
    await page.waitForSelector(".tm-shell", { timeout: 60_000 });
  } catch {
    // A warm-up that fails is not a reason to fail the run — the specs will
    // report the real problem in their own words a moment later.
  } finally {
    await browser.close();
  }
}
