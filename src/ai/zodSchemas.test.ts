import { describe, it, expect } from "vitest";
import { aiResponseSchema, aiTrialSchema } from "./zodSchemas";

describe("aiTrialSchema", () => {
  it("accepts a well-formed trial", () => {
    const result = aiTrialSchema.safeParse({
      prompt: "Touch the dollar.",
      correctChoiceId: "m-dollar",
      distractorChoiceIds: ["m-quarter", "m-dime"],
      difficulty: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a trial with no distractors", () => {
    const result = aiTrialSchema.safeParse({
      prompt: "Touch the dollar.",
      correctChoiceId: "m-dollar",
      distractorChoiceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range difficulty", () => {
    const result = aiTrialSchema.safeParse({
      prompt: "Touch the dollar.",
      correctChoiceId: "m-dollar",
      distractorChoiceIds: ["m-quarter"],
      difficulty: 9,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a too-short prompt", () => {
    const result = aiTrialSchema.safeParse({
      prompt: "hi",
      correctChoiceId: "m-dollar",
      distractorChoiceIds: ["m-quarter"],
    });
    expect(result.success).toBe(false);
  });
});

describe("aiResponseSchema", () => {
  function trial(i: number) {
    return {
      prompt: `Prompt number ${i}`,
      correctChoiceId: `c-${i}`,
      distractorChoiceIds: [`d-${i}`],
    };
  }

  it("accepts a response with 4–20 trials", () => {
    const trials = Array.from({ length: 8 }, (_, i) => trial(i));
    expect(aiResponseSchema.safeParse({ trials }).success).toBe(true);
  });

  it("rejects fewer than 4 trials", () => {
    const trials = Array.from({ length: 3 }, (_, i) => trial(i));
    expect(aiResponseSchema.safeParse({ trials }).success).toBe(false);
  });

  it("rejects more than 20 trials", () => {
    const trials = Array.from({ length: 21 }, (_, i) => trial(i));
    expect(aiResponseSchema.safeParse({ trials }).success).toBe(false);
  });
});
