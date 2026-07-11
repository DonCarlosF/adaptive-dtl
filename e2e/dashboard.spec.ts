import { test, expect } from "./fixtures";
import { gotoDashboard, openStudent } from "./helpers";

test.describe("Teacher dashboard (local mode)", () => {
  test("seeds and renders the three demo students", async ({ page }) => {
    await gotoDashboard(page);

    await expect(page.getByText("Teacher Dashboard")).toBeVisible();
    for (const name of ["Marcus", "Aaliyah", "DeShawn"]) {
      await expect(page.getByRole("button", { name: `Open ${name}` })).toBeVisible();
    }
    // Goal chips and per-domain start affordances render on the cards.
    await expect(page.getByRole("button", { name: "Add student" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start: Sight Words" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start: Community Signs" }).first(),
    ).toBeVisible();
  });

  test("opens a student detail with trend charts and seeded session history", async ({
    page,
  }) => {
    await gotoDashboard(page);
    await openStudent(page, "Marcus");

    // Profile section.
    await expect(page.getByText("Loves animals", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Co-pilot" })).toBeVisible();

    // One domain panel per goal, each with its own Start button and a
    // "Last: …" summary from the seeded history.
    for (const domain of ["Sight Words", "Money ID"]) {
      // Require the Start button so the mastery-heatmap card (which also
      // carries the domain name as a heading) doesn't match.
      const panel = page
        .locator("div.rounded-tile")
        .filter({ has: page.getByText(domain, { exact: true }) })
        .filter({
          has: page.getByRole("button", { name: "Start", exact: true }),
        });
      await expect(panel).toHaveCount(1);
      await expect(panel.getByRole("button", { name: "Start", exact: true })).toBeVisible();
      await expect(panel.getByText(/Last: \d+%/)).toBeVisible();
    }

    // Trend content: seeded students have 4+ sessions per domain, so the
    // lazy-loaded Recharts line chart mounts (svg.recharts-surface).
    await expect(page.locator(".recharts-surface").first()).toBeVisible({
      timeout: 20_000,
    });

    // Recent sessions list is populated from the seed (>= 4 per domain).
    await expect(page.getByRole("heading", { name: "Recent sessions" })).toBeVisible();
    expect(await page.locator("ul > li").count()).toBeGreaterThanOrEqual(8);
    await expect(page.getByRole("button", { name: "Replay" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  });
});
