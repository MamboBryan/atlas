import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Integration tests share a local Supabase DB and reuse fixture emails
    // (admin@atlas.com, user1@atlas.com, …). Parallel file execution races on
    // beforeEach cleanup, so we serialize.
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
