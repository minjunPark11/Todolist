import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default: the domain tests are the bulk of the suite and none of
    // them touch a DOM. The few that render a component opt in per file with
    // `// @vitest-environment jsdom`, so the fast path stays fast.
    environment: "node",
    // `src/**` only: the Playwright specs live in ./e2e and are run by
    // `npm run test:e2e`. Vitest picking them up would try to execute
    // @playwright/test's runner inside the unit run.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Shims for what jsdom leaves out. Guarded so the node-environment files,
    // which are most of them, are unaffected.
    setupFiles: ["./src/test/setup.ts"],
  },
});
