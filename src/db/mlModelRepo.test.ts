import { describe, it, expect } from "vitest";
import { mlModelKey } from "@/db/mlModelRepo";
import {
  DifficultyModel,
  deserializeModel,
  initModel,
  serializeModel,
  update,
} from "@/ml/difficultyModel";

/**
 * These tests cover the repo's PURE surface: the composite key and the
 * serialize/deserialize contract that `saveModel`/`getModel` round-trip
 * through. The Dexie-backed read/write paths are exercised through the app
 * at runtime; unit-testing them would require an IndexedDB shim (not a
 * dependency here), and the meaningful logic — key composition and the
 * stored blob format — is fully testable without one.
 */

describe("mlModelKey", () => {
  it("composes a stable, collision-resistant key", () => {
    expect(mlModelKey("stu-1", "sightWords")).toBe("stu-1::sightWords");
    expect(mlModelKey("stu-1", "moneyId")).toBe("stu-1::moneyId");
  });

  it("distinguishes students and domains", () => {
    expect(mlModelKey("a", "sightWords")).not.toBe(mlModelKey("b", "sightWords"));
    expect(mlModelKey("a", "sightWords")).not.toBe(mlModelKey("a", "moneyId"));
  });
});

describe("stored model blob (saveModel/getModel contract)", () => {
  function trained(): DifficultyModel {
    let m = initModel();
    for (let i = 0; i < 23; i++) {
      m = update(
        m,
        {
          recentAccuracy: (i % 5) / 5,
          rtTrend: i % 2 === 0 ? 0.3 : -0.2,
          attentionScore: (i % 4) / 4,
          numChoices: 2 + (i % 3),
          errorlessHighlight: i % 3 === 0,
        },
        i % 2 === 0,
      );
    }
    return m;
  }

  it("reconstructs an equivalent model from the persisted string", () => {
    const m = trained();
    // This is exactly what saveModel stores and getModel restores.
    const blob = serializeModel(m);
    const restored = deserializeModel(blob);

    expect(restored.trainedExamples).toBe(m.trainedExamples);
    expect(restored.bias).toBeCloseTo(m.bias, 12);
    expect(restored.learningRate).toBe(m.learningRate);
    restored.weights.forEach((w, i) => expect(w).toBeCloseTo(m.weights[i], 12));
  });

  it("getModel-style fallback yields a fresh model for a missing/corrupt row", () => {
    // getModel returns initModel() when no row exists; deserialize gives the
    // same when a row is corrupt. Both must be usable, untrained models.
    expect(initModel().trainedExamples).toBe(0);
    expect(deserializeModel("").trainedExamples).toBe(0);
  });
});
