import {
  AdaptationEvent,
  NextTrialDecision,
  SessionState,
  TrialResult,
} from "./types";

/**
 * Adaptive engine — pure functions only.
 *
 * Real adaptation isn't a thermostat. The rules below try to notice the
 * shape of a student's session, not just whether the last answer was
 * right. They are intentionally conservative: drop difficulty quickly
 * when a kid is struggling, raise it slowly when they're doing well.
 *
 * Rules implemented in pass 1 (response-based):
 *
 *  - 3 correct in a row → bump choice count (2→3, 3→4).
 *  - 2 incorrect in a row → drop to 2 choices, enable errorless highlight
 *    on the next trial.
 *  - Last response time > 2× rolling average → suggest a break.
 *  - At trial 8, accuracy < 50% → end the session early. We do not let a
 *    kid grind through a session that's not working.
 *
 * Pass 2 will compose `gazeRules.ts` decisions on top of these — see
 * `gazeRules.ts` for the extension point.
 */

export const PLANNED_TRIALS_PER_SESSION = 10;
const MIN_TRIALS_BEFORE_EARLY_END = 8;
const ACCURACY_THRESHOLD_FOR_EARLY_END = 0.5;
const RT_BREAK_MULTIPLIER = 2;
const MIN_RT_SAMPLE_FOR_BREAK = 3;

export function makeInitialState(
  studentId: string,
  domain: SessionState["domain"],
  initialChoices: 2 | 3 | 4 = 2,
): SessionState {
  return {
    studentId,
    domain,
    trials: [],
    adaptations: [],
    numChoices: initialChoices,
    errorlessHighlight: false,
    correctStreak: 0,
    incorrectStreak: 0,
    rollingAvgRtMs: 0,
  };
}

/**
 * Given a state and the just-completed trial, compute (a) the next state
 * and (b) the next-trial decision. Pure: same inputs → same outputs.
 */
export function reduce(
  state: SessionState,
  result: TrialResult,
): { next: SessionState; decision: NextTrialDecision } {
  const adaptations: AdaptationEvent[] = [];

  const trials = [...state.trials, result];
  const correctStreak = result.correct ? state.correctStreak + 1 : 0;
  const incorrectStreak = result.correct ? 0 : state.incorrectStreak + 1;

  const newAvg = updateRollingAvg(state.rollingAvgRtMs, trials);

  let numChoices: 2 | 3 | 4 = state.numChoices;
  let errorlessHighlight = false;

  // Rule: 3 correct in a row → bump choice count.
  if (correctStreak >= 3 && state.numChoices < 4) {
    const bumped = (state.numChoices + 1) as 2 | 3 | 4;
    numChoices = bumped;
    adaptations.push({
      kind: "increase-choices",
      trialIndex: result.index,
      reason: `3 correct in a row — increased to ${bumped} choices.`,
      timestamp: Date.now(),
    });
  }

  // Rule: 2 incorrect in a row → drop to 2 choices, enable errorless highlight.
  if (incorrectStreak >= 2) {
    if (state.numChoices > 2) {
      numChoices = 2;
      adaptations.push({
        kind: "decrease-choices",
        trialIndex: result.index,
        reason: "2 incorrect in a row — dropped back to 2 choices.",
        timestamp: Date.now(),
      });
    }
    errorlessHighlight = true;
    adaptations.push({
      kind: "enable-errorless",
      trialIndex: result.index,
      reason: "2 incorrect in a row — showing errorless highlight next trial.",
      timestamp: Date.now(),
    });
  }

  // Rule: response time > 2× rolling average → suggest a break.
  // We need at least a few samples before this kicks in or it false-positives
  // on the very first trial.
  let suggestBreak = false;
  const rtSamples = trials.length;
  if (
    rtSamples >= MIN_RT_SAMPLE_FOR_BREAK &&
    state.rollingAvgRtMs > 0 &&
    result.responseTimeMs > state.rollingAvgRtMs * RT_BREAK_MULTIPLIER
  ) {
    suggestBreak = true;
    adaptations.push({
      kind: "suggest-break",
      trialIndex: result.index,
      reason: `Response time ${(result.responseTimeMs / 1000).toFixed(
        1,
      )}s — over 2× rolling average. Suggested a break.`,
      timestamp: Date.now(),
    });
  }

  // Rule: at trial 8, accuracy < 50% → end early.
  let endEarly = false;
  let endReason: string | undefined;
  if (trials.length >= MIN_TRIALS_BEFORE_EARLY_END) {
    const acc = accuracy(trials);
    if (acc < ACCURACY_THRESHOLD_FOR_EARLY_END) {
      endEarly = true;
      endReason = `Accuracy ${(acc * 100).toFixed(
        0,
      )}% at trial ${trials.length} — ending session early.`;
      adaptations.push({
        kind: "early-end",
        trialIndex: result.index,
        reason: endReason,
        timestamp: Date.now(),
      });
    }
  }

  // Hit the planned trial count → end normally (not flagged as early).
  if (!endEarly && trials.length >= PLANNED_TRIALS_PER_SESSION) {
    endEarly = false;
  }

  const next: SessionState = {
    ...state,
    trials,
    adaptations: [...state.adaptations, ...adaptations],
    correctStreak,
    incorrectStreak,
    numChoices,
    errorlessHighlight,
    rollingAvgRtMs: newAvg,
  };

  const decision: NextTrialDecision = {
    suggestBreak,
    endEarly,
    endReason,
    numChoices,
    errorlessHighlight,
  };

  return { next, decision };
}

export function isSessionComplete(state: SessionState): boolean {
  return state.trials.length >= PLANNED_TRIALS_PER_SESSION;
}

export function accuracy(trials: TrialResult[]): number {
  if (trials.length === 0) return 0;
  const c = trials.filter((t) => t.correct).length;
  return c / trials.length;
}

function updateRollingAvg(prev: number, trials: TrialResult[]): number {
  // Equal-weight rolling average over the last 6 trials. Short window so
  // the engine reacts to fatigue or focus changes within a session.
  const window = trials.slice(-6);
  if (window.length === 0) return prev;
  const sum = window.reduce((a, t) => a + t.responseTimeMs, 0);
  return sum / window.length;
}
