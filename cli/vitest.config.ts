import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/lib/**"],
      exclude: ["src/index.ts", "src/commands/**", "src/types/**", "src/log.ts"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
