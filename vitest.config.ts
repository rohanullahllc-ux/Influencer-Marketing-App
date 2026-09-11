import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors tsconfig.base.json's path aliases so Vitest (which doesn't read
// tsconfig `paths` on its own) resolves workspace packages the same way.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Wave 1 tests hit a real local Postgres and are not safe to run
    // concurrently against each other (shared audit_log/workspace rows in
    // the dedicated rdv_test database) — see tests/setup.ts.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@rdv/db/systemClient": path.resolve(__dirname, "packages/db/src/systemClient.ts"),
      "@rdv/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@rdv/domain": path.resolve(__dirname, "packages/domain/src/index.ts"),
      "@rdv/queue": path.resolve(__dirname, "packages/queue/src/index.ts"),
      "@rdv/ai": path.resolve(__dirname, "packages/ai/src/index.ts"),
      "@rdv/notifications": path.resolve(__dirname, "packages/notifications/src/index.ts"),
      "@rdv/auth": path.resolve(__dirname, "packages/auth/src/index.ts"),
      "@rdv/lib": path.resolve(__dirname, "packages/lib/src/index.ts"),
    },
  },
});
