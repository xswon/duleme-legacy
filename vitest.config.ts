import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    allowOnly: false,
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts", "server.ts"],
      exclude: ["src/main.tsx", "src/types.ts"],
      thresholds: {
        global: {
          statements: 78.5,
          branches: 75.2,
          functions: 63.7,
          lines: 78.5,
        },
      },
    },
  },
});
