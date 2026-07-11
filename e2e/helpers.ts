import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Choice tiles in a session carry `data-choice-id` (src/components/ChoiceGrid.tsx). */
export const TILE_SELECTOR = "button[data-choice-id]";

/**
 * After an incorrect tap (or when the engine pre-enables errorless mode),
 * the CORRECT tile gets the sage errorless ring: `border-sage ring-4
 * ring-sage-100`. `ring-sage-100` is unique to that state — the switch-scan
 * highlight uses `ring-sky-200` — so it deterministically reveals the
 * correct answer without reading app internals.
 */
export const ERRORLESS_RING_SELECTOR = "button[data-choice-id].ring-sage-100";

/** Load the app and wait for the seeded dashboard (local mode). */
export async function gotoDashboard(page: Page): Promise<void> {
  await page.goto("/");
  // Seeding into IndexedDB happens on first load; Marcus is the first card.
  await expect(page.getByText("Marcus")).toBeVisible({ timeout: 20_000 });
}

/** Open a student's detail view from the dashboard list. */
export async function openStudent(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Open ${name}` }).click();
  // h2 in StudentDetail (the sticky header h1 also shows the name — scope to level 2).
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

/**
 * Start a session from StudentDetail via the domain panel's "Start" button,
 * then wait for the first trial's tiles to render.
 */
export async function startSessionFromDetail(
  page: Page,
  domainLabel: string,
): Promise<void> {
  await page
    .locator("div.rounded-tile")
    .filter({ has: page.getByText(domainLabel, { exact: true }) })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await expect(page.locator(TILE_SELECTOR).first()).toBeVisible({
    timeout: 20_000,
  });
}

/** Wait until the current trial is unlocked (tiles enabled after stubbed TTS ends). */
export async function waitForUnlockedTrial(page: Page): Promise<void> {
  await expect(page.locator(TILE_SELECTOR).first()).toBeEnabled({
    timeout: 15_000,
  });
}

/**
 * Deterministically complete the current trial with a correct answer,
 * regardless of where the correct tile is:
 *
 *   1. If the errorless ring is already showing, click the ringed tile.
 *   2. Otherwise click ANY tile (the first). If it was correct the app
 *      advances to feedback (tiles unmount); if it was wrong the app
 *      re-prompts errorlessly and rings the correct tile — click that.
 *
 * Wrong taps never record a result, so every completed trial is `correct`.
 */
export async function answerTrialCorrectly(page: Page): Promise<void> {
  await waitForUnlockedTrial(page);
  const ring = page.locator(ERRORLESS_RING_SELECTOR);
  if ((await ring.count()) > 0) {
    await ring.first().click();
    return;
  }
  await page.locator(TILE_SELECTOR).first().click();
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
    await ring.first().click();
  }
}

export type SessionScreen = "trial" | "break" | "done";

/**
 * Wait for the session to settle on its next interactive screen. The
 * adaptive engine can interleave break suggestions (response time > 2x
 * rolling average), so callers must be ready for any of the three.
 */
export async function nextSessionScreen(page: Page): Promise<SessionScreen> {
  const handle = await page.waitForFunction(
    (tileSel) => {
      if (document.body.innerText.includes("Nice work,")) return "done";
      const buttons = Array.from(document.querySelectorAll("button"));
      if (buttons.some((b) => (b.textContent ?? "").includes("I'm ready"))) {
        return "break";
      }
      const tile = document.querySelector<HTMLButtonElement>(tileSel);
      if (tile && !tile.disabled) return "trial";
      return null;
    },
    TILE_SELECTOR,
    { timeout: 30_000 },
  );
  return (await handle.jsonValue()) as SessionScreen;
}

/** Resume from the calm break screen. */
export async function resumeFromBreak(page: Page): Promise<void> {
  await page.getByRole("button", { name: "I'm ready" }).click();
}

/**
 * Exit a live session via the 3s hold-to-exit control
 * (src/components/LongPressExit.tsx, timing.longPressMs = 3000).
 */
export async function longPressExit(page: Page): Promise<void> {
  const exit = page.getByRole("button", { name: "Hold to exit" });
  await expect(exit).toBeVisible();
  const box = await exit.boundingBox();
  if (!box) throw new Error("Hold-to-exit button has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Hold comfortably past the 3s threshold; progress is rAF-driven.
  await page.waitForTimeout(3600);
  await page.mouse.up();
}

/** Navigate from the dashboard to the Settings page. */
export async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

/**
 * The switch inside a Settings row, located via its exact row label.
 * Row structure (src/pages/Settings.tsx): row > div.flex-1 > label div,
 * with the control in a sibling — so the row is two levels up.
 */
export function settingsToggle(page: Page, rowLabel: string): Locator {
  return page
    .getByText(rowLabel, { exact: true })
    .locator("../..")
    .getByRole("switch");
}

/**
 * Set a React-controlled range input. Playwright's fill() rejects
 * type=range, so drive the native value setter + input/change events.
 */
export async function setRangeValue(slider: Locator, value: number): Promise<void> {
  await slider.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/**
 * Accessibility smoke: every visible button / link-ish control must expose
 * a non-empty accessible name (aria-label, aria-labelledby, text content,
 * title, or contained image alt). Returns offender HTML snippets.
 */
export async function unnamedInteractiveElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], a[href]'),
    );
    const offenders: string[] = [];
    for (const el of els) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      const ariaLabel = el.getAttribute("aria-label")?.trim() ?? "";
      const labelledBy = (el.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
      const text = (el.textContent ?? "").trim();
      const title = el.getAttribute("title")?.trim() ?? "";
      const imgAlt = Array.from(el.querySelectorAll("img"))
        .map((img) => img.alt)
        .join(" ")
        .trim();
      if (!ariaLabel && !labelledBy && !text && !title && !imgAlt) {
        offenders.push(el.outerHTML.slice(0, 160));
      }
    }
    return offenders;
  });
}
