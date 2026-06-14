/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
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
  plugins: [
    react(),
    // --- PWA (installable, offline-first) ---
    // Auto-registers a Workbox service worker that precaches the app shell.
    // The app is local-first (IndexedDB), so the dashboard + sessions work
    // fully offline once installed. The WebGazer CDN script is deliberately
    // NOT precached so it degrades gracefully when offline.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Adaptive DTL — Discrete-Trial Learning",
        short_name: "Adaptive DTL",
        description:
          "Adaptive discrete-trial learning for special education. Local-first, offline-capable, with voice, AAC, and accessibility built in.",
        theme_color: "#7BA098",
        background_color: "#FAF7F2",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "en",
        categories: ["education", "accessibility"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Never intercept the external WebGazer CDN script — let the network
        // serve it when online and fail soft when offline.
        navigateFallbackDenylist: [/^\/api/, /webgazer/i],
      },
      devOptions: { enabled: false },
    }),
  ],
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
    // The cloud backend (server/) has its own Node-environment suite.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
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
