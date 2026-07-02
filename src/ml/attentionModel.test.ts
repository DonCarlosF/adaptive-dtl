import { describe, it, expect } from "vitest";
import { GazeSample } from "@/engine/gazeRules";
import {
  extractFeatures,
  labelFor,
  scoreAttention,
  Viewport,
} from "@/ml/attentionModel";

const VP: Viewport = { width: 1000, height: 800 };

/** Build a sample stream at ~10Hz starting at t0. */
function stream(
  points: Array<{ x: number; y: number; confidence?: number }>,
  t0 = 1_000,
  stepMs = 100,
): GazeSample[] {
  return points.map((p, i) => ({
    x: p.x,
    y: p.y,
    timestamp: t0 + i * stepMs,
    confidence: p.confidence ?? 0.9,
  }));
}

/** A jittery cluster around (cx, cy) with small Gaussian-ish noise. */
function cluster(
  n: number,
  cx: number,
  cy: number,
  spread: number,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    // Deterministic pseudo-noise so the test is reproducible.
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.678;
    const jx = ((a - Math.floor(a)) - 0.5) * 2 * spread;
    const jy = ((b - Math.floor(b)) - 0.5) * 2 * spread;
    out.push({ x: cx + jx, y: cy + jy });
  }
  return out;
}

describe("scoreAttention", () => {
  it("returns a neutral profile for an empty window", () => {
    const res = scoreAttention([], VP);
    expect(res.features.sampleCount).toBe(0);
    expect(res.score).toBeGreaterThan(0.4);
    expect(res.score).toBeLessThan(0.6);
    expect(res.features.onScreenRatio).toBe(0.5);
  });

  it("scores a tight, calm, on-screen fixation as focused", () => {
    const samples = stream(cluster(40, 500, 400, 8));
    const res = scoreAttention(samples, VP);
    expect(res.features.onScreenRatio).toBe(1);
    expect(res.features.fixationStability).toBeGreaterThan(0.9);
    expect(res.features.velocityCalmness).toBeGreaterThan(0.8);
    expect(res.score).toBeGreaterThanOrEqual(0.66);
    expect(res.label).toBe("focused");
  });

  it("scores frequent large off-screen excursions as disengaged", () => {
    // Alternate wildly between far corners, half of them off-screen.
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 40; i++) {
      pts.push(i % 2 === 0 ? { x: -300, y: -200 } : { x: 1300, y: 1100 });
    }
    const res = scoreAttention(stream(pts), VP);
    expect(res.features.onScreenRatio).toBe(0);
    expect(res.score).toBeLessThan(0.4);
    expect(res.label).toBe("disengaged");
  });

  it("ranks a focused window strictly above a disengaged one", () => {
    const focused = scoreAttention(stream(cluster(40, 500, 400, 8)), VP);
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 40; i++) {
      pts.push(i % 2 === 0 ? { x: -300, y: -200 } : { x: 1300, y: 1100 });
    }
    const disengaged = scoreAttention(stream(pts), VP);
    expect(focused.score).toBeGreaterThan(disengaged.score);
  });

  it("on-screen but drifting all over the screen reads as variable, not focused", () => {
    // On-screen everywhere, but spread across the whole viewport with big
    // hops between each sample.
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 40; i++) {
      pts.push({
        x: (i % 5) * 240 + 20,
        y: (i % 4) * 240 + 20,
      });
    }
    const res = scoreAttention(stream(pts), VP);
    expect(res.features.onScreenRatio).toBe(1);
    expect(res.features.fixationStability).toBeLessThan(0.7);
    expect(res.label).not.toBe("focused");
  });

  it("clamps the score to [0,1]", () => {
    const res = scoreAttention(stream(cluster(60, 500, 400, 2)), VP);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(1);
  });
});

describe("extractFeatures", () => {
  it("computes on-screen ratio as the fraction inside the viewport", () => {
    const pts = [
      { x: 100, y: 100 }, // on
      { x: 100, y: 100 }, // on
      { x: -50, y: 100 }, // off
      { x: 5000, y: 100 }, // off
    ];
    const f = extractFeatures(stream(pts), VP);
    expect(f.onScreenRatio).toBeCloseTo(0.5, 5);
  });

  it("treats a frozen single point as fully stable but low saccade rate", () => {
    const f = extractFeatures(stream(cluster(30, 500, 400, 0)), VP);
    expect(f.fixationStability).toBeCloseTo(1, 5);
    // No movement → no saccades → saccade regularity penalized (frozen).
    expect(f.saccadeRegularity).toBeLessThan(1);
    expect(f.velocityCalmness).toBeCloseTo(1, 5);
  });

  it("rewards a moderate saccade rate over a frantic one", () => {
    // Moderate: a couple of medium hops per second.
    const moderate: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 20; i++) {
      moderate.push(i % 4 < 2 ? { x: 400, y: 400 } : { x: 600, y: 400 });
    }
    // Frantic: a large jump every single 100ms step (~10/s).
    const frantic: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 20; i++) {
      frantic.push(i % 2 === 0 ? { x: 100, y: 100 } : { x: 900, y: 700 });
    }
    const fm = extractFeatures(stream(moderate), VP);
    const ff = extractFeatures(stream(frantic), VP);
    expect(fm.saccadeRegularity).toBeGreaterThan(ff.saccadeRegularity);
  });
});

describe("labelFor", () => {
  it("buckets scores into the three engagement labels", () => {
    expect(labelFor(0.9)).toBe("focused");
    expect(labelFor(0.66)).toBe("focused");
    expect(labelFor(0.5)).toBe("variable");
    expect(labelFor(0.4)).toBe("variable");
    expect(labelFor(0.39)).toBe("disengaged");
    expect(labelFor(0)).toBe("disengaged");
  });
});
