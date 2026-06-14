/**
 * Bridge from live session + gaze state into the difficulty model's
 * feature space. Kept here (not in the difficulty model) so the model
 * stays a pure function of an abstract feature object, and the messy job
 * of reading `SessionState` and a gaze buffer lives in one tested place.
 *
 * Pure: no store reads, no clock. The caller passes in the trials, the
 * attention score, and the current choice/errorless flags.
 */

import { TrialResult } from "@/engine/types";
import { DifficultyFeatures } from "@/ml/difficultyModel";

/** How many recent trials feed `recentAccuracy` and the RT baseline. */
const RECENT_WINDOW = 5;

export interface SessionFeatureInput {
  /** All completed trials this session, in order (the just-finished one last). */
  trials: TrialResult[];
  /** Engagement estimate from the attention model, 0..1. */
  attentionScore: number;
  /** Choices that WILL be presented next (post-reduce). */
  numChoices: number;
  /** Whether errorless highlight is active for the next trial. */
  errorlessHighlight: boolean;
}

/**
 * Build the feature object describing "how is this student doing right
 * now", used both to predict the next trial and (one trial later) to
 * train on what actually happened.
 *
 *  - recentAccuracy: rate of CLEAN successes over the last few trials. In
 *    this app's loop an incorrect tap re-prompts with the errorless
 *    highlight rather than recording a miss, so every recorded trial is
 *    `correct: true`; the signal that actually separates mastery from
 *    struggle is whether the errorless highlight was NEEDED. We therefore
 *    treat "correct AND no errorless highlight" as the success event.
 *  - rtTrend: how the latest response time compares to the recent
 *    baseline, as a signed ratio offset (+0.5 = 50% slower than usual).
 *    Defaults to 0 when there isn't enough history to be meaningful.
 */
export function buildDifficultyFeatures(
  input: SessionFeatureInput,
): DifficultyFeatures {
  const { trials, attentionScore, numChoices, errorlessHighlight } = input;
  const recent = trials.slice(-RECENT_WINDOW);

  const recentAccuracy =
    recent.length > 0
      ? recent.filter((t) => t.correct && !t.errorlessHighlight).length /
        recent.length
      : 0.5; // neutral prior with no history

  const rtTrend = computeRtTrend(trials);

  return {
    recentAccuracy,
    rtTrend,
    attentionScore,
    numChoices,
    errorlessHighlight,
  };
}

/**
 * Signed ratio of the latest response time against the average of the
 * preceding window. Returns 0 with fewer than two trials (no baseline).
 */
function computeRtTrend(trials: TrialResult[]): number {
  if (trials.length < 2) return 0;
  const latest = trials[trials.length - 1];
  const prior = trials.slice(-1 - RECENT_WINDOW, -1);
  if (prior.length === 0) return 0;
  const baseline =
    prior.reduce((a, t) => a + t.responseTimeMs, 0) / prior.length;
  if (baseline <= 0) return 0;
  return (latest.responseTimeMs - baseline) / baseline;
}
