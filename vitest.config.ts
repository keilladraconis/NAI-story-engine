import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the "nai-simple-ui" path mapping in tsconfig.json so UI components
  // that build on the vendored SUI framework can be unit-tested.
  resolve: {
    alias: {
      "nai-simple-ui": fileURLToPath(
        new URL("./vendor/nai-simple-ui/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
