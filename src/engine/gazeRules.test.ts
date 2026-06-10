import { describe, it, expect } from "vitest";
import {
  applyGazeRules,
  detectGazeOffScreen,
  GazeSample,
  GazeWindow,
  paceFromAttention,
  scoreLookBeforeAnswer,
} from "./gazeRules";
import { makeInitialState } from "./adaptiveEngine";

/** Minimal DOMRect for tests — only the fields the rules read. */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function sample(x: number, y: number, t: number): GazeSample {
  return { x, y, timestamp: t, confidence: 0.85 };
}

const VIEWPORT = { width: 1000, height: 800 };

function emptyWindow(overrides: Partial<GazeWindow> = {}): GazeWindow {
  return {
    samples: [],
    lastOnScreenAt: null,
    trialStartedAt: null,
    trialEndedAt: null,
    promptRect: null,
    choiceRects: [],
    viewport: VIEWPORT,
    ...overrides,
  };
}

const baseInput = (window: GazeWindow) => ({
  state: makeInitialState("s1", "sightWords" as const, 2),
  window,
  trialIndex: 0,
});

describe("detectGazeOffScreen", () => {
  it("returns no adaptation with no samples", () => {
    const out = detectGazeOffScreen(baseInput(emptyWindow()));
    expect(out.adaptations).toHaveLength(0);
  });

  it("suggests a break when off-screen exceeds 5s (via lastOnScreenAt)", () => {
    const window = emptyWindow({
      samples: [sample(-100, 400, 10_000)],
      lastOnScreenAt: 4_000, // 6s before the latest sample
    });
    const out = detectGazeOffScreen(baseInput(window));
    expect(out.adaptations).toHaveLength(1);
    expect(out.adaptations[0].kind).toBe("suggest-break");
    expect(out.decisionPatch?.suggestBreak).toBe(true);
  });

  it("stays quiet when the last on-screen sample is recent", () => {
    const window = emptyWindow({
      samples: [sample(500, 400, 10_000)],
      lastOnScreenAt: 9_000, // 1s ago
    });
    const out = detectGazeOffScreen(baseInput(window));
    expect(out.adaptations).toHaveLength(0);
  });
});

describe("scoreLookBeforeAnswer", () => {
  const choiceRects = [
    { id: "a", rect: rect(100, 100, 200, 200) },
    { id: "b", rect: rect(700, 100, 200, 200) },
  ];

  it("flags a guess when the gaze never fixates on a choice tile", () => {
    const window = emptyWindow({
      choiceRects,
      trialStartedAt: 1000,
      trialEndedAt: 2000,
      samples: [sample(500, 700, 1200), sample(510, 710, 1400)],
    });
    const out = scoreLookBeforeAnswer(baseInput(window));
    expect(out.adaptations).toHaveLength(1);
    expect(out.adaptations[0].reason).toMatch(/look-before-answer/i);
  });

  it("stays quiet when the gaze fixated on choices at least twice", () => {
    const window = emptyWindow({
      choiceRects,
      trialStartedAt: 1000,
      trialEndedAt: 2000,
      samples: [sample(150, 150, 1200), sample(750, 150, 1400)],
    });
    const out = scoreLookBeforeAnswer(baseInput(window));
    expect(out.adaptations).toHaveLength(0);
  });

  it("stays quiet when trial timing is missing", () => {
    const window = emptyWindow({ choiceRects, samples: [sample(150, 150, 200)] });
    expect(scoreLookBeforeAnswer(baseInput(window)).adaptations).toHaveLength(0);
  });
});

describe("paceFromAttention", () => {
  const promptRect = rect(400, 50, 200, 80);
  const choiceRects = [{ id: "a", rect: rect(100, 300, 200, 200) }];

  it("flags rough attention when >20% of in-trial samples are off-screen", () => {
    const samples = [
      sample(450, 80, 1100), // on prompt
      sample(-50, 400, 1200), // off-screen
      sample(-60, 410, 1300), // off-screen
      sample(150, 350, 1400), // on choice
    ];
    const window = emptyWindow({
      promptRect,
      choiceRects,
      trialStartedAt: 1000,
      trialEndedAt: 2000,
      samples,
    });
    const out = paceFromAttention(baseInput(window));
    expect(out.adaptations).toHaveLength(1);
    expect(out.adaptations[0].reason).toMatch(/rough attention/i);
  });

  it("stays quiet on steady attention", () => {
    const samples = [
      sample(450, 80, 1100),
      sample(150, 350, 1200),
      sample(160, 360, 1300),
      sample(450, 90, 1400),
    ];
    const window = emptyWindow({
      promptRect,
      choiceRects,
      trialStartedAt: 1000,
      trialEndedAt: 2000,
      samples,
    });
    expect(paceFromAttention(baseInput(window)).adaptations).toHaveLength(0);
  });
});

describe("applyGazeRules", () => {
  it("composes all rules and surfaces off-screen on the decision", () => {
    const window = emptyWindow({
      samples: [sample(-100, 400, 10_000)],
      lastOnScreenAt: 4_000,
      trialStartedAt: 0,
      trialEndedAt: 10_000,
      choiceRects: [{ id: "a", rect: rect(100, 100, 200, 200) }],
    });
    const out = applyGazeRules(baseInput(window));
    expect(out.decisionPatch?.suggestBreak).toBe(true);
    expect(out.adaptations.length).toBeGreaterThan(0);
  });
});
