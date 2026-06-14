import { describe, it, expect } from "vitest";
import {
  DifficultyFeatures,
  deserializeModel,
  featurize,
  initModel,
  predict,
  recommend,
  serializeModel,
  update,
} from "@/ml/difficultyModel";

function feat(p: Partial<DifficultyFeatures>): DifficultyFeatures {
  return {
    recentAccuracy: 0.5,
    rtTrend: 0,
    attentionScore: 0.5,
    numChoices: 3,
    errorlessHighlight: false,
    ...p,
  };
}

describe("initModel", () => {
  it("starts with a sensible, finite prior", () => {
    const m = initModel();
    expect(m.trainedExamples).toBe(0);
    expect(m.weights.length).toBe(5);
    expect(m.weights.every((w) => Number.isFinite(w))).toBe(true);
    // Prior should already lean: high accuracy + attention predicts success.
    const easy = predict(m, feat({ recentAccuracy: 1, attentionScore: 1, numChoices: 2 }));
    const hard = predict(m, feat({ recentAccuracy: 0, attentionScore: 0, numChoices: 4 }));
    expect(easy).toBeGreaterThan(hard);
  });
});

describe("predict", () => {
  it("returns a probability strictly within (0,1)", () => {
    const m = initModel();
    for (const f of [
      feat({ recentAccuracy: 1, attentionScore: 1 }),
      feat({ recentAccuracy: 0, attentionScore: 0 }),
      feat({ rtTrend: 5 }),
      feat({ rtTrend: -5 }),
    ]) {
      const p = predict(m, f);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("is monotone increasing in recentAccuracy", () => {
    const m = initModel();
    const lo = predict(m, feat({ recentAccuracy: 0.1 }));
    const mid = predict(m, feat({ recentAccuracy: 0.5 }));
    const hi = predict(m, feat({ recentAccuracy: 0.9 }));
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });

  it("is monotone decreasing in numChoices (more choices = harder)", () => {
    const m = initModel();
    const c2 = predict(m, feat({ numChoices: 2 }));
    const c4 = predict(m, feat({ numChoices: 4 }));
    expect(c4).toBeLessThan(c2);
  });
});

describe("featurize", () => {
  it("clamps and rescales raw inputs", () => {
    const x = featurize(
      feat({
        recentAccuracy: 2, // clamps to 1
        rtTrend: 9, // clamps to 1
        attentionScore: -1, // clamps to 0
        numChoices: 4, // → 1
        errorlessHighlight: true, // → 1
      }),
    );
    expect(x).toEqual([1, 1, 0, 1, 1]);
  });

  it("maps numChoices 2 → 0 and clamps rtTrend below -1", () => {
    const x = featurize(feat({ numChoices: 2, rtTrend: -3 }));
    expect(x[3]).toBe(0);
    expect(x[1]).toBe(-1);
  });
});

describe("update — immutability", () => {
  it("returns a new model and leaves the original untouched", () => {
    const m = initModel();
    const before = JSON.stringify(m);
    const m2 = update(m, feat({ recentAccuracy: 1 }), true);
    expect(m2).not.toBe(m);
    expect(JSON.stringify(m)).toBe(before); // original unchanged
    expect(m2.trainedExamples).toBe(1);
  });
});

describe("update — learning convergence on a separable dataset", () => {
  it("learns that high attention separates clean success from struggle", () => {
    // Synthetic separable rule: success iff attentionScore > 0.5.
    // We deliberately START from a model that does NOT know this by
    // zeroing the relevant prior, so any separation is learned.
    let m = initModel();
    m = { ...m, weights: [0, 0, 0, 0, 0], bias: 0, learningRate: 0.3 };

    const rng = mulberry32(42);
    for (let i = 0; i < 4000; i++) {
      const attentionScore = rng();
      const label = attentionScore > 0.5;
      m = update(
        m,
        feat({ attentionScore, recentAccuracy: 0.5, numChoices: 3 }),
        label,
      );
    }

    const pHigh = predict(m, feat({ attentionScore: 0.9 }));
    const pLow = predict(m, feat({ attentionScore: 0.1 }));
    // Strong, correct separation learned from data alone.
    expect(pHigh).toBeGreaterThan(0.75);
    expect(pLow).toBeLessThan(0.25);
    // The attention weight should have become clearly positive.
    expect(m.weights[2]).toBeGreaterThan(1);
  });

  it("drives predictions toward the empirical rate for a fixed input", () => {
    // All-identical features, label true 80% of the time. The model has no
    // way to discriminate, so its prediction should approach ~0.8.
    let m = initModel();
    m = { ...m, weights: [0, 0, 0, 0, 0], bias: 0, learningRate: 0.05 };
    const f = feat({ recentAccuracy: 0.5, attentionScore: 0.5, numChoices: 3 });
    const rng = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      m = update(m, f, rng() < 0.8);
    }
    expect(predict(m, f)).toBeGreaterThan(0.7);
    expect(predict(m, f)).toBeLessThan(0.9);
  });

  it("decreases binary cross-entropy loss over training", () => {
    let m = initModel();
    m = { ...m, weights: [0, 0, 0, 0, 0], bias: 0, learningRate: 0.2 };
    const data = makeSeparable(500, mulberry32(99));

    const lossBefore = bce(m, data);
    for (let epoch = 0; epoch < 20; epoch++) {
      for (const { f, label } of data) m = update(m, f, label);
    }
    const lossAfter = bce(m, data);
    expect(lossAfter).toBeLessThan(lossBefore);
  });
});

describe("recommend", () => {
  it("recommends raise when predicted success is high", () => {
    const m = initModel();
    const d = recommend(
      m,
      feat({ recentAccuracy: 1, attentionScore: 1, numChoices: 2 }),
    );
    expect(d.recommendation).toBe("raise");
    expect(d.predictedCorrect).toBeGreaterThanOrEqual(0.8);
    expect(d.reason).toContain("%");
  });

  it("recommends lower when predicted success is low", () => {
    const m = initModel();
    const d = recommend(
      m,
      feat({ recentAccuracy: 0, attentionScore: 0, numChoices: 4, errorlessHighlight: false }),
    );
    expect(d.recommendation).toBe("lower");
    expect(d.predictedCorrect).toBeLessThan(0.55);
  });

  it("holds in the productive-difficulty band", () => {
    // Find an input that lands in the hold band by construction.
    const m = initModel();
    let held = false;
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const d = recommend(m, feat({ recentAccuracy: a, attentionScore: a, numChoices: 3 }));
      if (d.recommendation === "hold") {
        held = true;
        expect(d.predictedCorrect).toBeGreaterThanOrEqual(0.55);
        expect(d.predictedCorrect).toBeLessThan(0.8);
        break;
      }
    }
    expect(held).toBe(true);
  });

  it("confidence grows with training history", () => {
    let trained = initModel();
    const f = feat({ recentAccuracy: 1, attentionScore: 1, numChoices: 2 });
    for (let i = 0; i < 30; i++) trained = update(trained, f, true);
    const fresh = recommend(initModel(), f);
    const mature = recommend(trained, f);
    expect(mature.confidence).toBeGreaterThan(fresh.confidence);
    expect(mature.confidence).toBeLessThanOrEqual(1);
  });
});

describe("serialization round-trip", () => {
  it("preserves a trained model exactly", () => {
    let m = initModel();
    for (let i = 0; i < 17; i++) {
      m = update(m, feat({ recentAccuracy: Math.random(), attentionScore: Math.random() }), Math.random() < 0.6);
    }
    const restored = deserializeModel(serializeModel(m));
    expect(restored.version).toBe(m.version);
    expect(restored.bias).toBeCloseTo(m.bias, 12);
    expect(restored.learningRate).toBe(m.learningRate);
    expect(restored.trainedExamples).toBe(m.trainedExamples);
    restored.weights.forEach((w, i) => expect(w).toBeCloseTo(m.weights[i], 12));
    // Predictions identical after round-trip.
    const f = feat({ recentAccuracy: 0.7, attentionScore: 0.3 });
    expect(predict(restored, f)).toBeCloseTo(predict(m, f), 12);
  });

  it("falls back to a fresh model on corrupt input", () => {
    expect(deserializeModel("not json").trainedExamples).toBe(0);
    expect(deserializeModel("{}").trainedExamples).toBe(0);
    expect(deserializeModel('{"version":1,"weights":[1,2],"bias":0}').weights.length).toBe(5);
    expect(
      deserializeModel('{"version":99,"weights":[0,0,0,0,0],"bias":0}').trainedExamples,
    ).toBe(0);
    expect(
      deserializeModel('{"version":1,"weights":[0,0,0,0,"x"],"bias":0}').weights.length,
    ).toBe(5);
  });
});

// --- helpers ---------------------------------------------------------------

/** Deterministic PRNG so convergence tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeparable(
  n: number,
  rng: () => number,
): Array<{ f: DifficultyFeatures; label: boolean }> {
  const out: Array<{ f: DifficultyFeatures; label: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const recentAccuracy = rng();
    const attentionScore = rng();
    // Linearly separable target with a little margin.
    const label = recentAccuracy + attentionScore > 1;
    out.push({ f: feat({ recentAccuracy, attentionScore }), label });
  }
  return out;
}

function bce(
  m: ReturnType<typeof initModel>,
  data: Array<{ f: DifficultyFeatures; label: boolean }>,
): number {
  const eps = 1e-9;
  let s = 0;
  for (const { f, label } of data) {
    const p = predict(m, f);
    const y = label ? 1 : 0;
    s += -(y * Math.log(p + eps) + (1 - y) * Math.log(1 - p + eps));
  }
  return s / data.length;
}
