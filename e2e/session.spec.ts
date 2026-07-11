import { test, expect } from "./fixtures";
import {
  answerTrialCorrectly,
  gotoDashboard,
  longPressExit,
  nextSessionScreen,
  openStudent,
  resumeFromBreak,
  startSessionFromDetail,
  waitForUnlockedTrial,
} from "./helpers";

test.describe("Student session loop (local mode)", () => {
  test("completes a full 10-trial session and records it in Recent sessions", async ({
    page,
  }) => {
    // 10 trials x (stubbed TTS unlock + 1.6s feedback) plus possible break
    // screens — give this flow generous headroom.
    test.setTimeout(240_000);

    await gotoDashboard(page);
    await openStudent(page, "Marcus");
    await startSessionFromDetail(page, "Sight Words");

    // HUD progress ring starts at 0/10 and the session view is active.
    await expect(page.getByText("0/10", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hold to exit" })).toBeVisible();

    // Drive the session to completion. The adaptive engine may interleave
    // break suggestions (response time > 2x rolling average), so react to
    // whatever screen comes next. Every completed trial must advance the
    // HUD counter — the first three prove the loop deterministically.
    let completed = 0;
    let done = false;
    for (let guard = 0; guard < 40 && !done; guard++) {
      const screen = await nextSessionScreen(page);
      if (screen === "done") {
        done = true;
      } else if (screen === "break") {
        await resumeFromBreak(page);
      } else {
        await answerTrialCorrectly(page);
        completed += 1;
        await expect(
          page.getByText(`${completed}/10`, { exact: true }),
        ).toBeVisible({ timeout: 15_000 });
      }
    }
    expect(done).toBe(true);
    expect(completed).toBe(10);

    // Completion screen: every trial was answered correctly (wrong taps
    // re-prompt errorlessly and never record), so 10 of 10.
    await expect(
      page.getByRole("heading", { name: "Nice work, Marcus." }),
    ).toBeVisible();
    await expect(page.getByText("10 of 10 correct")).toBeVisible();

    // Exit and verify the session was persisted into Recent sessions.
    await page.getByRole("button", { name: "Back to dashboard" }).click();
    await expect(page.getByRole("button", { name: "Add student" })).toBeVisible();

    await openStudent(page, "Marcus");
    const newRow = page
      .locator("li")
      .filter({ hasText: "today" })
      .filter({ hasText: "Sight Words" });
    // Seeded history is 1+ days old, so "today" uniquely identifies ours.
    await expect(newRow).toHaveCount(1);
    await expect(newRow).toContainText("10 trials");
    await expect(newRow).toContainText("100%");
  });

  test("long-press exit leaves a session mid-trial and returns to the dashboard", async ({
    page,
  }) => {
    await gotoDashboard(page);
    await openStudent(page, "Aaliyah");
    await startSessionFromDetail(page, "Money ID");
    await waitForUnlockedTrial(page);

    await longPressExit(page);

    // Back on the dashboard student list.
    await expect(page.getByRole("button", { name: "Add student" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Teacher Dashboard")).toBeVisible();
  });
});
