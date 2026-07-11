import { test, expect } from "./fixtures";

/**
 * Cloud mode: a second production build (dist-cloud) baked with
 * VITE_API_URL=http://localhost:8787 is served on :4174, talking to the
 * real Express backend from server/ (started by playwright.config.ts).
 */
test.use({ baseURL: "http://localhost:4174" });

test.describe("Cloud mode (real backend)", () => {
  test("registers a teacher, lands on the empty cloud dashboard, signs out", async ({
    page,
  }) => {
    await page.goto("/");

    // Cloud builds gate on login before anything else.
    await expect(page.getByText("Sign in to your classroom.")).toBeVisible({
      timeout: 20_000,
    });

    // Switch to the register flow (email + 8+ char password).
    await page.getByRole("button", { name: "Need an account? Register" }).click();
    await expect(page.getByText("Create a teacher account.")).toBeVisible();

    const email = `e2e-teacher-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("super-secret-pw-1");
    await page.getByRole("button", { name: "Create account" }).click();

    // Fresh account → empty cloud dashboard (no local seed in cloud mode).
    await expect(page.getByText("Teacher Dashboard")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("No students yet. Add one to get started."),
    ).toBeVisible();

    // Sign out through Settings' cloud-only Account section.
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(
      page.getByText("You're signed in to the cloud backend", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page.getByText("Sign in to your classroom.")).toBeVisible();

    // The token was cleared: a reload still gates on login.
    await page.reload();
    await expect(page.getByText("Sign in to your classroom.")).toBeVisible();
  });
});
