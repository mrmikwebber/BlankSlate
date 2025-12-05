// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // we're only testing pure math, no DOM needed
    include: ["tests/**/*.test.ts"],
  },
});
