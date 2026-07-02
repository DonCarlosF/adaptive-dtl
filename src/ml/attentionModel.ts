/**
 * Attention / engagement scoring from a window of gaze samples.
 *
 * Why a hand-built feature model and not a neural net:
 *   - The signal is low-dimensional and well-understood from the eye-
 *     tracking literature (on-screen ratio, fixation stability, saccade
 *     rate, velocity). A handful of normalized features combined with a
 *     transparent weighting beats an opaque model we can neither inspect
 *     nor justify to a teacher.
 *   - It is a PURE function of its inputs: same samples → same score. That
 *     makes it trivially testable and keeps it on-device with zero deps.
 *
 * The output `score` is a calibrated 0..1 engagement estimate; `label`
 * buckets it into the three states the dashboard speaks in. `features`
 * is exposed so the difficulty model (and tests) can consume the raw,
 * normalized signals directly rather than re-deriving them.
 */

import { GazeSample } from "@/engine/gazeRules";

export interface Viewport {
  width: number;
  height: number;
}

export type AttentionLabel = "focused" | "variable" | "disengaged";

/**
 * Normalized (0..1) attention features. Each is oriented so that HIGHER
 * means MORE engaged, which lets the score be a simple weighted sum.
 */
export interface AttentionFeatures {
  /** Fraction of samples inside the viewport. */
  onScreenRatio: number;
  /**
   * Spatial stability: 1 = gaze tightly clustered (fixating), 0 = gaze
   * spread across the whole screen. Derived from sample dispersion.
   */
  fixationStability: number;
  /**
   * Saccade regularity: 1 = a calm, task-like rate of gaze shifts,
   * 0 = either frozen (no shifts, possibly zoned out) or frantic
   * (constant large jumps). Engagement is highest in the middle band.
   */
  saccadeRegularity: number;
  /**
   * Velocity calmness: 1 = low mean inter-sample velocity (smooth
   * pursuit / fixation), 0 = high velocity (darting around).
   */
  velocityCalmness: number;
  /** Number of samples the features were computed from. */
  sampleCount: number;
}

export interface AttentionResult {
  /** Calibrated engagement estimate, 0..1. */
  score: number;
  label: AttentionLabel;
  features: AttentionFeatures;
}

/**
 * Feature weights. Tuned by hand against synthetic windows (see tests),
 * not learned — engagement scoring is a fixed, auditable heuristic; the
 * LEARNING happens downstream in the difficulty model, which consumes
 * this score as one input. Weights sum to 1 so the score stays in 0..1.
 */
const WEIGHTS = {
  onScreenRatio: 0.4,
  fixationStability: 0.25,
  saccadeRegularity: 0.15,
  velocityCalmness: 0.2,
} as const;

const FOCUSED_THRESHOLD = 0.66;
const DISENGAGED_THRESHOLD = 0.4;

/**
 * A saccade is a gaze shift larger than this fraction of the viewport
 * diagonal. Smaller movements are treated as fixational jitter.
 */
const SACCADE_FRACTION = 0.08;

/**
 * The "engaged" saccade rate band, in saccades per second. Below the low
 * end reads as frozen/zoned-out; above the high end reads as scanning /
 * agitated. A child working a 2–4 choice trial shifts gaze a few times a
 * second, so the band is centered there.
 */
const SACCADE_RATE_LOW = 0.5;
const SACCADE_RATE_HIGH = 4;

/**
 * Velocity (viewport-diagonals per second) that maps to fully "calm".
 * Above ~1.5 diagonals/s the gaze is darting and calmness floors out.
 */
const VELOCITY_CALM_CEILING = 1.5;

/**
 * Score a window of gaze samples. Samples are assumed chronological (the
 * gaze store buffers them in order); we defensively tolerate empty and
 * single-sample windows.
 */
export function scoreAttention(
  samples: GazeSample[],
  viewport: Viewport,
): AttentionResult {
  const features = extractFeatures(samples, viewport);
  const score = clamp01(
    WEIGHTS.onScreenRatio * features.onScreenRatio +
      WEIGHTS.fixationStability * features.fixationStability +
      WEIGHTS.saccadeRegularity * features.saccadeRegularity +
      WEIGHTS.velocityCalmness * features.velocityCalmness,
  );
  return { score, label: labelFor(score), features };
}

export function labelFor(score: number): AttentionLabel {
  if (score >= FOCUSED_THRESHOLD) return "focused";
  if (score < DISENGAGED_THRESHOLD) return "disengaged";
  return "variable";
}

/**
 * Pull the four normalized features from a sample window. Exposed so the
 * difficulty model can reuse it, and so tests can assert on raw features.
 */
export function extractFeatures(
  samples: GazeSample[],
  viewport: Viewport,
): AttentionFeatures {
  const diag = Math.hypot(viewport.width, viewport.height) || 1;

  // An empty window carries no evidence. Returning a neutral-low profile
  // (rather than 0) avoids the difficulty model over-reacting to a missing
  // gaze stream — "no data" is not the same as "disengaged".
  if (samples.length === 0) {
    return {
      onScreenRatio: 0.5,
      fixationStability: 0.5,
      saccadeRegularity: 0.5,
      velocityCalmness: 0.5,
      sampleCount: 0,
    };
  }

  // --- On-screen ratio -----------------------------------------------------
  const onScreen = samples.filter((s) =>
    inViewport(s, viewport),
  ).length;
  const onScreenRatio = onScreen / samples.length;

  // --- Fixation stability --------------------------------------------------
  // Use the RMS distance of samples from their centroid as dispersion.
  // Normalize by the viewport diagonal, then invert: tight cluster → 1.
  const mean = centroid(samples);
  const dispersion =
    Math.sqrt(
      samples.reduce(
        (acc, s) => acc + (s.x - mean.x) ** 2 + (s.y - mean.y) ** 2,
        0,
      ) / samples.length,
    ) / diag;
  // A dispersion of ~0.35 diagonals is already "all over the screen";
  // scale so that maps to 0 stability.
  const fixationStability = clamp01(1 - dispersion / 0.35);

  // --- Saccades: count large jumps and the mean per-step velocity ----------
  let saccadeCount = 0;
  let velocitySum = 0;
  let velocitySteps = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y) / diag;
    if (dist >= SACCADE_FRACTION) saccadeCount++;
    const dtSec = (cur.timestamp - prev.timestamp) / 1000;
    if (dtSec > 0) {
      velocitySum += dist / dtSec; // diagonals per second
      velocitySteps++;
    }
  }

  const elapsedSec = durationSec(samples);
  const saccadeRate = elapsedSec > 0 ? saccadeCount / elapsedSec : 0;
  const saccadeRegularity = bandScore(
    saccadeRate,
    SACCADE_RATE_LOW,
    SACCADE_RATE_HIGH,
  );

  const meanVelocity = velocitySteps > 0 ? velocitySum / velocitySteps : 0;
  const velocityCalmness = clamp01(1 - meanVelocity / VELOCITY_CALM_CEILING);

  return {
    onScreenRatio,
    fixationStability,
    saccadeRegularity,
    velocityCalmness,
    sampleCount: samples.length,
  };
}

// --- helpers ---------------------------------------------------------------

function inViewport(s: GazeSample, vp: Viewport): boolean {
  return s.x >= 0 && s.x <= vp.width && s.y >= 0 && s.y <= vp.height;
}

function centroid(samples: GazeSample[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const s of samples) {
    sx += s.x;
    sy += s.y;
  }
  return { x: sx / samples.length, y: sy / samples.length };
}

function durationSec(samples: GazeSample[]): number {
  if (samples.length < 2) return 0;
  return (
    (samples[samples.length - 1].timestamp - samples[0].timestamp) / 1000
  );
}

/**
 * Score a value by how well it sits inside a [low, high] band. Returns 1
 * across the band's interior and ramps linearly to 0 over a margin on
 * each side, so being a little outside is gently penalized rather than
 * cliff-edged. Used for the "Goldilocks" saccade rate.
 */
function bandScore(value: number, low: number, high: number): number {
  if (value >= low && value <= high) return 1;
  const margin = (high - low) / 2;
  if (value < low) return clamp01(1 - (low - value) / margin);
  return clamp01(1 - (value - high) / margin);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
