import { test, expect } from "./fixtures";
import {
  ERRORLESS_RING_SELECTOR,
  TILE_SELECTOR,
  gotoDashboard,
  longPressExit,
  openSettings,
  openStudent,
  setRangeValue,
  settingsToggle,
  startSessionFromDetail,
  waitForUnlockedTrial,
} from "./helpers";

test.describe("Single-switch scanning", () => {
  test("scan highlight cycles across tiles and Select chooses the highlighted one", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Enable scanning in Settings and slow the dwell to 4s so reading the
    // highlighted tile and pressing Select never races the scan advance.
    await gotoDashboard(page);
    await openSettings(page);

    const toggle = settingsToggle(page, "Single-switch scanning");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    const dwellRow = page.getByText(/^Scan dwell:/).locator("../..");
    await setRangeValue(dwellRow.locator('input[type="range"]'), 4000);
    await expect(page.getByText("Scan dwell: 4.0s per item")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();

    // Start a session; scanning activates once the trial unlocks.
    await openStudent(page, "Marcus");
    await startSessionFromDetail(page, "Sight Words");
    await waitForUnlockedTrial(page);

    const tiles = page.locator(TILE_SELECTOR);
    const selectButton = page.getByRole("button", {
      name: "Select the highlighted choice",
    });
    await expect(selectButton).toBeVisible();

    // The scan starts on the first tile, then the sky highlight
    // (aria-current="true") advances to the second — i.e. it cycles.
    await expect(tiles.nth(0)).toHaveAttribute("aria-current", "true");
    await expect(tiles.nth(1)).toHaveAttribute("aria-current", "true", {
      timeout: 8_000,
    });
    await expect(tiles.nth(0)).not.toHaveAttribute("aria-current", "true");

    // We are now at the START of tile 1's 4s dwell window: capture the
    // highlighted tile and activate the on-screen switch.
    const chosenId = await tiles.nth(1).getAttribute("data-choice-id");
    expect(chosenId).toBeTruthy();
    await selectButton.click();

    // The Select press routes the HIGHLIGHTED tile through the answer path:
    // either it was correct (trial advances, HUD ticks to 1/10) or it was
    // wrong (errorless ring appears on the OTHER, correct tile).
    const outcome = await page.waitForFunction(
      ({ tile, ringSel }) => {
        if (!document.querySelector(tile)) return "advanced";
        if (document.querySelector(ringSel)) return "errorless";
        return null;
      },
      { tile: TILE_SELECTOR, ringSel: ERRORLESS_RING_SELECTOR },
      { timeout: 10_000 },
    );
    if ((await outcome.jsonValue()) === "errorless") {
      const ringedId = await page
        .locator(ERRORLESS_RING_SELECTOR)
        .getAttribute("data-choice-id");
      expect(ringedId).not.toBe(chosenId);
    } else {
      await expect(page.getByText("1/10", { exact: true })).toBeVisible();
    }

    await longPressExit(page);
    await expect(page.getByRole("button", { name: "Add student" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
