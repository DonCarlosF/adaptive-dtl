import { describe, it, expect } from "vitest";
import {
  accuracy,
  isSessionComplete,
  makeInitialState,
  PLANNED_TRIALS_PER_SESSION,
  reduce,
} from "./adaptiveEngine";
import { DomainId, SessionState, TrialResult } from "./types";

const DOMAIN: DomainId = "sightWords";

function trial(overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    index: 0,
    templateId: "t",
    domain: DOMAIN,
    numChoices: 2,
    correct: true,
    responseTimeMs: 1000,
    errorlessHighlight: false,
    timestamp: 0,
    ...overrides,
  };
}

/** Feed a sequence of results through reduce(), returning the final state. */
function run(
  initial: SessionState,
  results: TrialResult[],
): { state: SessionState; lastDecision: ReturnType<typeof reduce>["decision"] } {
  let state = initial;
  let lastDecision = reduce(state, results[0]).decision;
  for (let i = 0; i < results.length; i++) {
    const r = { ...results[i], index: state.trials.length };
    const out = reduce(state, r);
    state = out.next;
    lastDecision = out.decision;
  }
  return { state, lastDecision };
}

describe("accuracy", () => {
  it("is 0 for an empty trial list", () => {
    expect(accuracy([])).toBe(0);
  });

  it("computes the correct fraction", () => {
    const trials = [
      trial({ correct: true }),
      trial({ correct: false }),
      trial({ correct: true }),
      trial({ correct: true }),
    ];
    expect(accuracy(trials)).toBeCloseTo(0.75);
  });
});

describe("reduce — choice count rules", () => {
  it("bumps choices after 3 correct in a row", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    const { state } = run(init, [
      trial({ correct: true }),
      trial({ correct: true }),
      trial({ correct: true }),
    ]);
    expect(state.numChoices).toBe(3);
    expect(state.correctStreak).toBe(3);
    expect(
      state.adaptations.some((a) => a.kind === "increase-choices"),
    ).toBe(true);
  });

  it("does not bump past 4 choices", () => {
    let init = makeInitialState("s1", DOMAIN, 4);
    const { state } = run(init, [
      trial({ correct: true }),
      trial({ correct: true }),
      trial({ correct: true }),
      trial({ correct: true }),
    ]);
    expect(state.numChoices).toBe(4);
    expect(
      state.adaptations.some((a) => a.kind === "increase-choices"),
    ).toBe(false);
  });

  it("drops to 2 choices and enables errorless after 2 wrong in a row", () => {
    const init = makeInitialState("s1", DOMAIN, 4);
    const { state, lastDecision } = run(init, [
      trial({ correct: false }),
      trial({ correct: false }),
    ]);
    expect(state.numChoices).toBe(2);
    expect(lastDecision.errorlessHighlight).toBe(true);
    expect(state.adaptations.some((a) => a.kind === "enable-errorless")).toBe(
      true,
    );
    expect(state.adaptations.some((a) => a.kind === "decrease-choices")).toBe(
      true,
    );
  });

  it("resets the correct streak on a wrong answer", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    const { state } = run(init, [
      trial({ correct: true }),
      trial({ correct: true }),
      trial({ correct: false }),
    ]);
    expect(state.correctStreak).toBe(0);
    expect(state.incorrectStreak).toBe(1);
  });
});

describe("reduce — break suggestion", () => {
  it("suggests a break when response time exceeds 2x the rolling average", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    // Three fast trials to establish a rolling average, then a slow one.
    let state = init;
    for (const rt of [1000, 1000, 1000]) {
      state = reduce(state, trial({ responseTimeMs: rt, index: state.trials.length }))
        .next;
    }
    const { decision } = reduce(
      state,
      trial({ responseTimeMs: 5000, index: state.trials.length }),
    );
    expect(decision.suggestBreak).toBe(true);
  });

  it("does not suggest a break before enough samples exist", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    const { decision } = reduce(init, trial({ responseTimeMs: 9999 }));
    expect(decision.suggestBreak).toBe(false);
  });
});

describe("reduce — early end", () => {
  it("ends early when accuracy is below 50% at trial 8", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    // 8 trials, only 3 correct => 37.5% < 50%.
    const results = [true, false, false, true, false, true, false, false].map(
      (c) => trial({ correct: c }),
    );
    const { lastDecision } = run(init, results);
    expect(lastDecision.endEarly).toBe(true);
    expect(lastDecision.endReason).toMatch(/ending session early/i);
  });

  it("does not end early when accuracy is at or above 50%", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    const results = [true, true, true, true, false, false, false, false].map(
      (c) => trial({ correct: c }),
    );
    const { lastDecision } = run(init, results);
    expect(lastDecision.endEarly).toBe(false);
  });
});

describe("isSessionComplete", () => {
  it("is true once the planned trial count is reached", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    const results = Array.from({ length: PLANNED_TRIALS_PER_SESSION }, () =>
      trial({ correct: true }),
    );
    const { state } = run(init, results);
    expect(isSessionComplete(state)).toBe(true);
  });

  it("is false before the planned trial count", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    expect(isSessionComplete(init)).toBe(false);
  });
});

describe("reduce — purity", () => {
  it("does not mutate the input state", () => {
    const init = makeInitialState("s1", DOMAIN, 2);
    const snapshot = JSON.stringify(init);
    reduce(init, trial({ correct: true }));
    expect(JSON.stringify(init)).toBe(snapshot);
  });
});
