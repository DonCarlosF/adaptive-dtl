// Calibration freshness — pure helpers for the Settings panel.
//
// WebGazer's ridge regression drifts as seating, lighting, and screen
// position change, so a calibration older than about a week (or one that
// never happened) deserves a gentle nudge when camera tracking is on.
// `AppSettings.lastCalibrationAt` is stamped by the calibration overlay on
// completion (see calibration.tsx).

/** Calibrations older than this are considered stale. */
export const CALIBRATION_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * True when calibration should be (re)run: never calibrated, more than
 * CALIBRATION_STALE_MS ago, or stamped in the future (clock skew — treat
 * an untrustworthy stamp as stale rather than silently fresh).
 */
export function isCalibrationStale(
  lastCalibrationAt: number | null,
  now: number = Date.now(),
): boolean {
  if (lastCalibrationAt == null) return true;
  const age = now - lastCalibrationAt;
  if (age < 0) return true;
  return age > CALIBRATION_STALE_MS;
}

/**
 * Compact relative age for "Last calibrated: …" — "never", "just now",
 * "35 min ago", "3 hours ago", "12 days ago". Teacher-facing (Settings),
 * so English by design.
 */
export function formatCalibrationAge(
  lastCalibrationAt: number | null,
  now: number = Date.now(),
): string {
  if (lastCalibrationAt == null) return "never";
  const mins = Math.floor((now - lastCalibrationAt) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
