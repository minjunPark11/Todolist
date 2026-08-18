// Browser E2E for the Add List flow (Add List design §17.3).
//
// Scoped deliberately. §R.9 records what each layer catches: the rules are
// domain tests, the interactions that need an event loop are jsdom, and what
// is left for a real browser is everything that needs LAYOUT, real navigation,
// or real storage — jsdom computes none of those. These specs are that list.
//
// Chromium only. The gate asks for Desktop / Tablet / Mobile, which are three
// viewports rather than three engines; running the same assertions through
// three rendering engines would buy vendor-CSS coverage nobody has asked for
// at three times the CI cost.
import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  // The app is local-first, so these drive real localStorage. Serial keeps two
  // specs from writing the same account state underneath each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 800, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
