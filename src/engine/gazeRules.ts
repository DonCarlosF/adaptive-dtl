// SIMULATED — see EYE_TRACKING.md
//
// Pass 2: rules are implemented for real and run against the synthetic
// gaze stream produced by `src/eyetracking/syntheticGaze.ts`. Swapping
// the source for real WebGazer predictions changes nothing in this
// file — same `GazeSample` shape, same window structure.

import { AdaptationEvent, NextTrialDecision, SessionState } from "./types";

export interface GazeSample {
  x: number;
  y: number;
  timestamp: number;
  confidence: number;
}

export interface GazeWindow {
  /** Recent samples in chronological order. */
  samples: GazeSample[];
  /** ms timestamp of the last on-screen sample, or null. */
  lastOnScreenAt: number | null;
  /** When this trial started (ms timestamp from Date.now()). */
  trialStartedAt: number | null;
  /** When the response was registered (ms timestamp). */
  trialEndedAt: number | null;
  /** Rectangle of the active prompt area in viewport pixels. */
  promptRect: DOMRect | null;
  /** Rectangles of each visible choice tile keyed by id. */
  choiceRects: Array<{ id: string; rect: DOMRect }>;
  /** Width and height of the viewport. */
  viewport: { width: number; height: number };
}

export interface GazeRuleInput {
  state: SessionState;
  window: GazeWindow;
  /** Just-completed trial index (or -1 if pre-trial check). */
  trialIndex: number;
}

export interface GazeRuleOutput {
  adaptations: AdaptationEvent[];
  decisionPatch?: Partial<NextTrialDecision>;
}

const OFF_SCREEN_BREAK_MS = 5000;

/**
 * Off-screen detection: if no on-screen sample for >5s, suggest a break.
 *
 * We trust the store's `lastOnScreenAt` (cheaper than scanning samples
 * every tick). When it's null but the stream is active, we fall back to
 * scanning the recent buffer.
 */
export function detectGazeOffScreen(input: GazeRuleInput): GazeRuleOutput {
  const { samples, lastOnScreenAt, viewport } = input.window;
  if (samples.length === 0) return { adaptations: [] };
  const now = samples[samples.length - 1].timestamp;
  let offMs = 0;
  if (lastOnScreenAt != null) {
    offMs = now - lastOnScreenAt;
  } else {
    offMs = scanContinuousOffScreen(samples, viewport);
  }
  if (offMs <= OFF_SCREEN_BREAK_MS) return { adaptations: [] };
  return {
    adaptations: [
      {
        kind: "suggest-break",
        trialIndex: input.trialIndex,
        reason: `Eyes off screen for ${(offMs / 1000).toFixed(
          1,
        )}s — suggested a break.`,
        timestamp: now,
      },
    ],
    decisionPatch: { suggestBreak: true },
  };
}

/**
 * Did the student look at any choice tile between prompt-end and the
 * response? If not, we log a "guessed without looking" event. This does
 * not change difficulty by itself — it's evidence for the dashboard.
 */
export function scoreLookBeforeAnswer(input: GazeRuleInput): GazeRuleOutput {
  const { samples, choiceRects, trialStartedAt, trialEndedAt } = input.window;
  if (
    !trialStartedAt ||
    !trialEndedAt ||
    samples.length === 0 ||
    choiceRects.length === 0
  ) {
    return { adaptations: [] };
  }
  const inWindow = samples.filter(
    (s) => s.timestamp >= trialStartedAt && s.timestamp <= trialEndedAt,
  );
  if (inWindow.length === 0) return { adaptations: [] };

  const fixations = inWindow.filter((s) =>
    choiceRects.some(({ rect }) => pointInRect(s.x, s.y, rect)),
  );
  if (fixations.length >= 2) return { adaptations: [] };

  return {
    adaptations: [
      {
        kind: "suggest-break",
        // Reusing the suggest-break kind keeps the kind union stable in
        // pass 1 schemas — the reason is what surfaces on the dashboard.
        trialIndex: input.trialIndex,
        reason:
          "Low look-before-answer (gaze did not fixate on choices) — answer may have been a guess.",
        timestamp: samples[samples.length - 1].timestamp,
      },
    ],
  };
}

/**
 * Quick attention summary for the trial's gaze window. Logs an
 * adaptation describing what was observed; does not change difficulty.
 *
 * The signal we surface here:
 *   - "Steady attention" — most samples within the prompt or choice areas
 *   - "Drifting" — many samples outside the on-screen attractors but on-screen
 *   - "Rough" — multiple short off-screen excursions
 */
export function paceFromAttention(input: GazeRuleInput): GazeRuleOutput {
  const { samples, choiceRects, promptRect, trialStartedAt, trialEndedAt } =
    input.window;
  if (
    !trialStartedAt ||
    !trialEndedAt ||
    samples.length === 0
  ) {
    return { adaptations: [] };
  }
  const inWindow = samples.filter(
    (s) => s.timestamp >= trialStartedAt && s.timestamp <= trialEndedAt,
  );
  if (inWindow.length === 0) return { adaptations: [] };

  const total = inWindow.length;
  const onAttractor = inWindow.filter(
    (s) =>
      (promptRect && pointInRect(s.x, s.y, promptRect)) ||
      choiceRects.some(({ rect }) => pointInRect(s.x, s.y, rect)),
  ).length;
  const offScreen = inWindow.filter((s) => !inViewport(s, input.window.viewport)).length;

  const onAttractorPct = onAttractor / total;
  const offScreenPct = offScreen / total;

  let label: "steady" | "drifting" | "rough";
  if (offScreenPct > 0.2) label = "rough";
  else if (onAttractorPct > 0.6) label = "steady";
  else label = "drifting";

  // Only surface the rough case as an adaptation event so the dashboard
  // stays quiet on uneventful trials.
  if (label !== "rough") return { adaptations: [] };

  return {
    adaptations: [
      {
        kind: "suggest-break",
        trialIndex: input.trialIndex,
        reason: `Rough attention (${Math.round(
          offScreenPct * 100,
        )}% of samples off-screen during trial).`,
        timestamp: samples[samples.length - 1].timestamp,
      },
    ],
  };
}

/** Compose all gaze rules. Off-screen takes priority on the decision. */
export function applyGazeRules(input: GazeRuleInput): GazeRuleOutput {
  const off = detectGazeOffScreen(input);
  const look = scoreLookBeforeAnswer(input);
  const pace = paceFromAttention(input);
  return {
    adaptations: [...off.adaptations, ...look.adaptations, ...pace.adaptations],
    decisionPatch: {
      ...pace.decisionPatch,
      ...look.decisionPatch,
      ...off.decisionPatch,
    },
  };
}

function pointInRect(x: number, y: number, r: DOMRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function inViewport(s: GazeSample, vp: { width: number; height: number }): boolean {
  return s.x >= 0 && s.x <= vp.width && s.y >= 0 && s.y <= vp.height;
}

function scanContinuousOffScreen(
  samples: GazeSample[],
  vp: { width: number; height: number },
): number {
  // Walk back from the end until we hit an on-screen sample.
  let i = samples.length - 1;
  let endTs = samples[i].timestamp;
  while (i >= 0 && !inViewport(samples[i], vp)) {
    i--;
  }
  if (i < 0) return endTs - samples[0].timestamp;
  return endTs - samples[i].timestamp;
}
