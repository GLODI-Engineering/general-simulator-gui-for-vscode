import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.ts"],
    exclude: ["**/node_modules/**", "vitest.config.ts", "package.json"],
  },
});
