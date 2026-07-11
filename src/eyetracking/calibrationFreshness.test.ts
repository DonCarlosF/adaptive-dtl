import { describe, it, expect } from "vitest";
import {
  CALIBRATION_STALE_MS,
  formatCalibrationAge,
  isCalibrationStale,
} from "./calibrationFreshness";

const NOW = 1_800_000_000_000; // fixed reference instant
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("isCalibrationStale", () => {
  it("is stale when never calibrated", () => {
    expect(isCalibrationStale(null, NOW)).toBe(true);
  });

  it("is fresh right after calibrating and within the 7-day window", () => {
    expect(isCalibrationStale(NOW, NOW)).toBe(false);
    expect(isCalibrationStale(NOW - 3 * DAY, NOW)).toBe(false);
    // Exactly at the boundary still counts as fresh (strictly older is stale).
    expect(isCalibrationStale(NOW - CALIBRATION_STALE_MS, NOW)).toBe(false);
  });

  it("is stale when older than 7 days", () => {
    expect(isCalibrationStale(NOW - CALIBRATION_STALE_MS - 1, NOW)).toBe(true);
    expect(isCalibrationStale(NOW - 30 * DAY, NOW)).toBe(true);
  });

  it("treats a future (clock-skewed) stamp as stale, not fresh", () => {
    expect(isCalibrationStale(NOW + HOUR, NOW)).toBe(true);
  });
});

describe("formatCalibrationAge", () => {
  it("returns 'never' for null", () => {
    expect(formatCalibrationAge(null, NOW)).toBe("never");
  });

  it("returns 'just now' under a minute", () => {
    expect(formatCalibrationAge(NOW, NOW)).toBe("just now");
    expect(formatCalibrationAge(NOW - 59_000, NOW)).toBe("just now");
  });

  it("formats minutes and hours (with singular/plural)", () => {
    expect(formatCalibrationAge(NOW - 5 * MIN, NOW)).toBe("5 min ago");
    expect(formatCalibrationAge(NOW - HOUR, NOW)).toBe("1 hour ago");
    expect(formatCalibrationAge(NOW - 5 * HOUR, NOW)).toBe("5 hours ago");
  });

  it("formats days (with singular/plural)", () => {
    expect(formatCalibrationAge(NOW - DAY, NOW)).toBe("1 day ago");
    expect(formatCalibrationAge(NOW - 12 * DAY, NOW)).toBe("12 days ago");
  });
});
