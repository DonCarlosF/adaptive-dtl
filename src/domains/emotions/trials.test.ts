import { describe, it, expect } from "vitest";
import { buildEmotionTrials, EMOTIONS, findEmotion } from "./trials";

describe("EMOTIONS", () => {
  it("covers the eight taught feelings with unique ids", () => {
    expect(EMOTIONS).toHaveLength(8);
    expect(new Set(EMOTIONS.map((e) => e.id)).size).toBe(8);
    expect(EMOTIONS.map((e) => e.kind).sort()).toEqual(
      [
        "angry",
        "calm",
        "excited",
        "happy",
        "sad",
        "scared",
        "surprised",
        "tired",
      ].sort(),
    );
  });

  it("findEmotion resolves known ids and rejects unknown ones", () => {
    expect(findEmotion("e-happy")?.spoken).toBe("happy");
    expect(findEmotion("e-bored")).toBeUndefined();
  });
});

describe("buildEmotionTrials", () => {
  const trials = buildEmotionTrials();

  it("builds 12 trials — every emotion once plus a core-vocabulary second pass", () => {
    expect(trials).toHaveLength(12);
    const targets = trials.map((t) => t.correctChoiceId);
    for (const e of EMOTIONS) expect(targets).toContain(e.id);
    // Core regulation words get the extra reps.
    for (const id of ["e-happy", "e-sad", "e-angry", "e-calm"]) {
      expect(targets.filter((t) => t === id)).toHaveLength(2);
    }
  });

  it("uses unique em- prefixed template ids", () => {
    const ids = trials.map((t) => t.id);
    expect(new Set(ids).size).toBe(trials.length);
    for (const id of ids) expect(id).toMatch(/^em-e-[a-z]+-\d+$/);
  });

  it("always includes the correct choice among the choices", () => {
    for (const t of trials) {
      expect(t.choiceIds).toContain(t.correctChoiceId);
      expect(findEmotion(t.correctChoiceId)).toBeDefined();
    }
  });

  it("prompts name the feeling in plain words", () => {
    for (const t of trials) {
      const e = findEmotion(t.correctChoiceId)!;
      expect(t.prompt).toBe(`Touch the person who feels ${e.spoken}.`);
    }
  });
});
