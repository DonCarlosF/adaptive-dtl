/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Bundle strategy: see BUNDLE.md for the full write-up.
 *
 * - Route chunks come from `React.lazy()` in `App.tsx`.
 * - In-route chunks (Recharts, SessionReplay, AnthropicClient) are
 *   lazy-loaded inside their owning components.
 * - The `manualChunks` map below carves vendor libraries into their own
 *   files so the initial dashboard payload doesn't ship Recharts or Zod.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/**/*.d.ts",
      ],
    },
  },
  build: {
    // Bump the warning ceiling so build doesn't yell about the
    // (intentionally) standalone Recharts chunk.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Function form so the rules also catch sub-files like
        // `react/cjs/react.production.min.js` and recharts/d3 internals.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
          if (id.includes("/recharts/") || id.includes("/d3-")) {
            return "charts";
          }
          if (id.includes("/dexie")) return "db";
          if (id.includes("/zod")) return "validation";
          if (id.includes("/zustand")) return "state";
          return undefined;
        },
      },
    },
  },
});
