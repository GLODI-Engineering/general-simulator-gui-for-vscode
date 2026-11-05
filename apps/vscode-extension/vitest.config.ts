import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration specs run inside a real VS Code, not vitest.
    exclude: ["src/integration/**"],
  },
});
