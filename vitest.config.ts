import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        plugins: [react()],
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.{ts,tsx}", "**/node_modules/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts", "test/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
          // Integration tests share ONE Postgres + MinIO bucket and TRUNCATE
          // between tests. Run all integration files in a single fork so no two
          // files race on the shared DB (one fork's afterEach truncate would
          // otherwise wipe another fork's in-flight rows).
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
