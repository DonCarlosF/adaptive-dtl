import { defineConfig } from "vitest/config";

export default defineConfig({
  // Server tests are pure Node — no CSS pipeline. An inline (empty) PostCSS
  // config stops Vite from searching upward and loading the repo-root
  // postcss.config.js, which references tailwindcss (absent from server/'s
  // isolated install in CI).
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});

