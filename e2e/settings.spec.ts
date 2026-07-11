import { test, expect } from "./fixtures";
import { gotoDashboard, openSettings, settingsToggle } from "./helpers";

test.describe("Settings persistence (Dexie)", () => {
  test("a flipped toggle survives a full page reload", async ({ page }) => {
    await gotoDashboard(page);
    await openSettings(page);

    const toggle = settingsToggle(page, "High-contrast mode");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    // settingsRepo.patch awaits the IndexedDB write before updating the UI,
    // so aria-checked=true means the value is durably stored.
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await gotoDashboard(page);
    await openSettings(page);

    await expect(settingsToggle(page, "High-contrast mode")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // A neighbouring toggle stayed untouched — the write was scoped.
    await expect(
      settingsToggle(page, "OpenDyslexic font for sight words"),
    ).toHaveAttribute("aria-checked", "false");
  });
});
