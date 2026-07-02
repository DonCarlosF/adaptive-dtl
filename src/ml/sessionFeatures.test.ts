import { describe, it, expect } from "vitest";
import { TrialResult } from "@/engine/types";
import { buildDifficultyFeatures } from "@/ml/sessionFeatures";

function trial(p: Partial<TrialResult>): TrialResult {
  return {
    index: 0,
    templateId: "t",
    domain: "sightWords",
    numChoices: 3,
    correct: true,
    responseTimeMs: 1000,
    errorlessHighlight: false,
    timestamp: 0,
    ...p,
  };
}

describe("buildDifficultyFeatures", () => {
  it("uses a neutral accuracy prior with no trials", () => {
    const f = buildDifficultyFeatures({
      trials: [],
      attentionScore: 0.7,
      numChoices: 3,
      errorlessHighlight: false,
    });
    expect(f.recentAccuracy).toBe(0.5);
    expect(f.rtTrend).toBe(0);
    expect(f.attentionScore).toBe(0.7);
    expect(f.numChoices).toBe(3);
  });

  it("treats clean correct (no errorless) as success, errorless as struggle", () => {
    const clean = buildDifficultyFeatures({
      trials: [
        trial({ correct: true, errorlessHighlight: false }),
        trial({ correct: true, errorlessHighlight: false }),
      ],
      attentionScore: 0.5,
      numChoices: 3,
      errorlessHighlight: false,
    });
    expect(clean.recentAccuracy).toBe(1);

    const struggled = buildDifficultyFeatures({
      trials: [
        trial({ correct: true, errorlessHighlight: true }),
        trial({ correct: true, errorlessHighlight: true }),
      ],
      attentionScore: 0.5,
      numChoices: 3,
      errorlessHighlight: true,
    });
    expect(struggled.recentAccuracy).toBe(0);
  });

  it("computes rtTrend as a positive offset when the latest is slower", () => {
    const trials = [
      trial({ responseTimeMs: 1000 }),
      trial({ responseTimeMs: 1000 }),
      trial({ responseTimeMs: 2000 }), // 100% slower than the 1000ms baseline
    ];
    const f = buildDifficultyFeatures({
      trials,
      attentionScore: 0.5,
      numChoices: 3,
      errorlessHighlight: false,
    });
    expect(f.rtTrend).toBeCloseTo(1, 5);
  });

  it("computes rtTrend as negative when the latest is faster", () => {
    const trials = [
      trial({ responseTimeMs: 2000 }),
      trial({ responseTimeMs: 2000 }),
      trial({ responseTimeMs: 1000 }), // 50% faster
    ];
    const f = buildDifficultyFeatures({
      trials,
      attentionScore: 0.5,
      numChoices: 3,
      errorlessHighlight: false,
    });
    expect(f.rtTrend).toBeCloseTo(-0.5, 5);
  });

  it("only considers the recent window for accuracy", () => {
    // 5 struggled (older) + 5 clean (recent) → window of 5 = all clean.
    const older = Array.from({ length: 5 }, () =>
      trial({ errorlessHighlight: true }),
    );
    const recent = Array.from({ length: 5 }, () =>
      trial({ errorlessHighlight: false }),
    );
    const f = buildDifficultyFeatures({
      trials: [...older, ...recent],
      attentionScore: 0.5,
      numChoices: 3,
      errorlessHighlight: false,
    });
    expect(f.recentAccuracy).toBe(1);
  });
});
