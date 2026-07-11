import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser E2E suite for Adaptive DTL.
 *
 * Entry point: `npm run e2e` — it builds BOTH bundles first, then runs
 * `playwright test`, which launches three managed web servers:
 *
 *   1. :4173 — `vite preview` over `dist/` (local/IndexedDB mode). Most
 *      specs run against this.
 *   2. :4174 — `vite preview --outDir dist-cloud` over a second build made
 *      with `VITE_API_URL=http://localhost:8787` baked in (cloud mode).
 *      Only e2e/cloud.spec.ts targets this (via `test.use({ baseURL })`).
 *   3. :8787 — the real Express backend (`server/`) run with tsx, using a
 *      throwaway JSON data file under .e2e-tmp/ (gitignored). Specs use
 *      unique per-run emails, so a stale data file is harmless.
 *
 * Prebuilt-dist choice: we serve production builds (not the dev server) so
 * the suite exercises what ships — chunking, the PWA service worker, and
 * the injected manifest. `npm run e2e` performs the builds; running bare
 * `npx playwright test` requires `npm run e2e:build` to have been run.
 *
 * Browsers: locally, PLAYWRIGHT_BROWSERS_PATH points at preinstalled
 * browsers (do NOT run `playwright install`); the pinned @playwright/test
 * matches the preinstalled Chromium revision. In CI the workflow installs
 * Chromium explicitly with `npx playwright install --with-deps chromium`.
 */

const LOCAL_PORT = 4173;
const CLOUD_PORT = 4174;
const API_PORT = 8787;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Keep flake tolerance minimal: one retry in CI, none locally.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${LOCAL_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `npm run preview -- --port ${LOCAL_PORT} --strictPort`,
      url: `http://localhost:${LOCAL_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run preview -- --outDir dist-cloud --port ${CLOUD_PORT} --strictPort`,
      url: `http://localhost:${CLOUD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npx tsx src/index.ts",
      cwd: "./server",
      env: {
        JWT_SECRET: "e2e-secret",
        PORT: String(API_PORT),
        DATA_FILE: "../.e2e-tmp/cloud-server-data.json",
        ANTHROPIC_API_KEY: "",
      },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
