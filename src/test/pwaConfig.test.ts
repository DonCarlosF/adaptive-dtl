import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards the PWA wiring without importing the Vite config (which would pull
 * in the full plugin graph). We assert the manifest fields and key Workbox
 * choices are present in source, so a regression that drops the manifest or
 * un-excludes the WebGazer CDN is caught.
 */
const root = resolve(__dirname, "../..");
const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");

describe("PWA configuration", () => {
  it("registers the VitePWA plugin", () => {
    expect(viteConfig).toContain("VitePWA(");
    expect(viteConfig).toContain('registerType: "autoUpdate"');
  });

  it("declares a manifest matching the calm palette", () => {
    expect(viteConfig).toContain('short_name: "Adaptive DTL"');
    expect(viteConfig).toContain('theme_color: "#7BA098"');
    expect(viteConfig).toContain('background_color: "#FAF7F2"');
    expect(viteConfig).toContain('display: "standalone"');
  });

  it("references the generated icon assets", () => {
    expect(viteConfig).toContain("pwa-192x192.png");
    expect(viteConfig).toContain("pwa-512x512.png");
    expect(viteConfig).toContain('purpose: "maskable"');
  });

  it("excludes the external WebGazer CDN from caching", () => {
    expect(viteConfig).toMatch(/navigateFallbackDenylist/);
    expect(viteConfig).toMatch(/webgazer/i);
  });

  it("keeps the Vitest + manualChunks config intact", () => {
    expect(viteConfig).toContain("manualChunks");
    expect(viteConfig).toContain("environment: \"jsdom\"");
    expect(viteConfig).toContain('"./src/test/setup.ts"');
  });
});
