import { test, expect } from "./fixtures";
import {
  gotoDashboard,
  openStudent,
  startSessionFromDetail,
  unnamedInteractiveElements,
  waitForUnlockedTrial,
} from "./helpers";

test.describe("Accessibility smoke", () => {
  test("every visible control on the dashboard has an accessible name", async ({
    page,
  }) => {
    await gotoDashboard(page);
    expect(await unnamedInteractiveElements(page)).toEqual([]);

    // Student detail view too (charts, exports, replay, co-pilot).
    await openStudent(page, "Marcus");
    await expect(page.getByRole("heading", { name: "Recent sessions" })).toBeVisible();
    expect(await unnamedInteractiveElements(page)).toEqual([]);
  });

  test("every visible control during a live trial has an accessible name", async ({
    page,
  }) => {
    await gotoDashboard(page);
    await openStudent(page, "DeShawn");
    // DeShawn responds via eye gaze, so this session also mounts the
    // switch-scanning Select control — included in the sweep.
    await startSessionFromDetail(page, "Community Signs");
    await waitForUnlockedTrial(page);

    expect(await unnamedInteractiveElements(page)).toEqual([]);

    // Choice tiles expose their answer as the accessible name.
    const tiles = page.locator("button[data-choice-id]");
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const label = await tiles.nth(i).getAttribute("aria-label");
      expect(label?.trim()).toBeTruthy();
    }
  });
});
