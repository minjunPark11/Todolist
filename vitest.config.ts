import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default: the domain tests are the bulk of the suite and none of
    // them touch a DOM. The few that render a component opt in per file with
    // `// @vitest-environment jsdom`, so the fast path stays fast.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
