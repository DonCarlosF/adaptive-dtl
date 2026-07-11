import { test, expect } from "./fixtures";

test.describe("PWA artifacts (production build)", () => {
  test("served HTML links the web app manifest", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", "/manifest.webmanifest");
  });

  test("service worker script and manifest are served with valid content", async ({
    request,
  }) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["content-type"] ?? "").toContain("javascript");
    expect((await sw.text()).length).toBeGreaterThan(0);

    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = JSON.parse(await res.text()) as {
      name?: string;
      short_name?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string }>;
    };
    expect(manifest.name).toContain("Adaptive DTL");
    expect(manifest.short_name).toBe("Adaptive DTL");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons!.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons!) {
      expect(icon.src).toBeTruthy();
      expect(icon.sizes).toBeTruthy();
    }
  });

  test("the service worker actually registers in the browser", async ({ page }) => {
    await page.goto("/");
    // main.tsx registers the Workbox SW in PROD builds; localhost counts as
    // a secure context, so a registration should appear shortly.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            if (!("serviceWorker" in navigator)) return "unsupported";
            const reg = await navigator.serviceWorker.getRegistration();
            return reg ? "registered" : "pending";
          }),
        { timeout: 20_000 },
      )
      .toBe("registered");
  });
});
