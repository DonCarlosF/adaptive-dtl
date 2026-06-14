/**
 * Online difficulty model — a logistic-regression learner trained by
 * stochastic gradient descent, in pure TypeScript.
 *
 * What it does: given features describing the student's recent behavior,
 * it predicts P(the student answers the NEXT trial correctly). From that
 * probability it emits an ADVISORY recommendation — raise, hold, or lower
 * difficulty — that the session loop can gently fold into the rule-based
 * decision. It never overrides the safety rules (early-end, forced drop
 * on two misses); see the integration in StudentSession.
 *
 * Why logistic regression and not something heavier:
 *   - The relationship "more skill / more attention → more likely correct"
 *     is monotone and roughly linear in our feature space, which is
 *     exactly logistic regression's home turf.
 *   - It learns ONLINE from one example at a time, so it improves across
 *     a student's sessions without batch retraining.
 *   - Weights are interpretable and tiny to serialize — a handful of
 *     floats per (student, domain). That fits the on-device, offline,
 *     no-heavy-deps constraint.
 *
 * All update functions are IMMUTABLE: `update` returns a NEW model so the
 * learner composes cleanly with React state and is trivially testable.
 */

/** Raw, per-trial inputs the caller assembles from session + gaze state. */
export interface DifficultyFeatures {
  /** Accuracy over the recent window, 0..1. */
  recentAccuracy: number;
  /**
   * Response-time trend vs the rolling average. Positive = the last
   * response was SLOWER than usual (a struggle signal); negative = faster.
   * Expressed as a ratio offset, e.g. +0.5 = 50% slower than average.
   * Unbounded in principle but clamped when featurized.
   */
  rtTrend: number;
  /** Engagement estimate from the attention model, 0..1. */
  attentionScore: number;
  /** Choices currently presented (2..4). */
  numChoices: number;
  /** Whether the errorless highlight was active on the last trial. */
  errorlessHighlight: boolean;
}

/** Serializable model. `bias` is the intercept term. */
export interface DifficultyModel {
  /** Schema version, for forward-compatible deserialization. */
  version: number;
  /** Weight per feature, in FEATURE_ORDER. */
  weights: number[];
  bias: number;
  /** SGD learning rate. */
  learningRate: number;
  /** Count of `update` calls — used for confidence and diagnostics. */
  trainedExamples: number;
}

export type DifficultyRecommendation = "raise" | "hold" | "lower";

export interface MLDecision {
  /** P(correct) for the next trial under current difficulty, 0..1. */
  predictedCorrect: number;
  recommendation: DifficultyRecommendation;
  /**
   * 0..1 confidence in the recommendation. Grows with training history
   * and with how far the prediction sits from the decision band edges.
   */
  confidence: number;
  /** Human-readable rationale for the adaptation log / dashboard. */
  reason: string;
}

/**
 * Fixed feature ordering. The model vector and the featurizer MUST agree
 * on this; keeping it in one place prevents silent index drift.
 */
export const FEATURE_ORDER = [
  "recentAccuracy",
  "rtTrendClamped",
  "attentionScore",
  "numChoicesNorm",
  "errorlessHighlight",
] as const;

const NUM_FEATURES = FEATURE_ORDER.length;
const MODEL_VERSION = 1;
const DEFAULT_LEARNING_RATE = 0.1;
/** L2 regularization strength — keeps weights from blowing up on a
 * student with a long, lopsided history. */
const L2 = 0.001;

/**
 * Decision band: if predicted P(correct) is comfortably high the student
 * has headroom (raise); comfortably low means they're struggling (lower);
 * the middle is the productive-difficulty zone (hold).
 */
const RAISE_THRESHOLD = 0.8;
const LOWER_THRESHOLD = 0.55;

/**
 * Fresh model. Weights start at a small, sensible prior rather than zero:
 * recent accuracy and attention positively predict success, more choices
 * makes a trial harder (negative), errorless support helps (positive).
 * This gives a useful recommendation before any learning has happened and
 * is quickly overwritten by data.
 */
export function initModel(
  learningRate: number = DEFAULT_LEARNING_RATE,
): DifficultyModel {
  return {
    version: MODEL_VERSION,
    // [recentAccuracy, rtTrend, attention, numChoices, errorless]
    weights: [1.5, -0.5, 1.0, -0.8, 0.5],
    bias: 0,
    learningRate,
    trainedExamples: 0,
  };
}

/**
 * Map raw features into the model's input vector. Featurization is the
 * single source of truth for scaling so `predict` and `update` never
 * disagree:
 *   - rtTrend is clamped to [-1, 1] (one rolling-avg either way) to keep
 *     a single very slow response from dominating the gradient.
 *   - numChoices is mapped from [2,4] to [0,1].
 *   - booleans become 0/1.
 */
export function featurize(f: DifficultyFeatures): number[] {
  return [
    clamp(f.recentAccuracy, 0, 1),
    clamp(f.rtTrend, -1, 1),
    clamp(f.attentionScore, 0, 1),
    clamp((f.numChoices - 2) / 2, 0, 1),
    f.errorlessHighlight ? 1 : 0,
  ];
}

/** P(correct) ∈ (0,1) for the given features. */
export function predict(model: DifficultyModel, f: DifficultyFeatures): number {
  const x = featurize(f);
  return sigmoid(dot(model.weights, x) + model.bias);
}

/**
 * One SGD step on a single observed outcome. Returns a NEW model.
 *
 * Loss is binary cross-entropy; the gradient of BCE through the sigmoid
 * collapses to the familiar `(prediction - target) * x`, with L2 shrinkage
 * on the weights (not the bias).
 */
export function update(
  model: DifficultyModel,
  f: DifficultyFeatures,
  actualCorrect: boolean,
): DifficultyModel {
  const x = featurize(f);
  const p = sigmoid(dot(model.weights, x) + model.bias);
  const target = actualCorrect ? 1 : 0;
  const error = p - target; // dLoss/dz

  const lr = model.learningRate;
  const weights = model.weights.map(
    (w, i) => w - lr * (error * x[i] + L2 * w),
  );
  const bias = model.bias - lr * error;

  return {
    ...model,
    weights,
    bias,
    trainedExamples: model.trainedExamples + 1,
  };
}

/**
 * Turn a prediction into an advisory decision. The recommendation only
 * suggests a DIRECTION — the caller decides whether (and how safely) to
 * act on it. Confidence blends two ideas: how much the model has learned,
 * and how decisively the prediction clears the nearest band edge.
 */
export function recommend(
  model: DifficultyModel,
  f: DifficultyFeatures,
): MLDecision {
  const p = predict(model, f);

  let recommendation: DifficultyRecommendation;
  let margin: number;
  if (p >= RAISE_THRESHOLD) {
    recommendation = "raise";
    margin = p - RAISE_THRESHOLD;
  } else if (p < LOWER_THRESHOLD) {
    recommendation = "lower";
    margin = LOWER_THRESHOLD - p;
  } else {
    recommendation = "hold";
    // For "hold", confidence is highest in the band center.
    const center = (RAISE_THRESHOLD + LOWER_THRESHOLD) / 2;
    const halfWidth = (RAISE_THRESHOLD - LOWER_THRESHOLD) / 2;
    margin = halfWidth - Math.abs(p - center);
  }

  // Maturity: ramps from 0 toward 1 over the first ~20 examples so a brand-
  // new model speaks tentatively.
  const maturity = clamp(model.trainedExamples / 20, 0, 1);
  // Decisiveness: how far past the edge, scaled into 0..1.
  const decisiveness = clamp(margin / 0.2, 0, 1);
  const confidence = clamp(0.5 * maturity + 0.5 * decisiveness, 0, 1);

  const pct = Math.round(p * 100);
  const reason =
    recommendation === "raise"
      ? `ML: predicted ${pct}% likely correct — student has headroom, could raise difficulty.`
      : recommendation === "lower"
        ? `ML: predicted ${pct}% likely correct — student may be struggling, consider easing difficulty.`
        : `ML: predicted ${pct}% likely correct — difficulty looks well-matched, holding.`;

  return { predictedCorrect: p, recommendation, confidence, reason };
}

// --- serialization ---------------------------------------------------------

/**
 * Compact JSON string for the Dexie row. We keep it a string (not a raw
 * object) so the persisted shape is decoupled from the in-memory model and
 * survives field reordering / additive schema growth.
 */
export function serializeModel(model: DifficultyModel): string {
  return JSON.stringify({
    version: model.version,
    weights: model.weights,
    bias: model.bias,
    learningRate: model.learningRate,
    trainedExamples: model.trainedExamples,
  });
}

/**
 * Rebuild a model from its serialized form. Defensive: a corrupt, empty,
 * wrong-length, or future-version blob falls back to a fresh model rather
 * than throwing into the session loop.
 */
export function deserializeModel(blob: string): DifficultyModel {
  try {
    const raw = JSON.parse(blob) as Partial<DifficultyModel>;
    if (
      !raw ||
      raw.version !== MODEL_VERSION ||
      !Array.isArray(raw.weights) ||
      raw.weights.length !== NUM_FEATURES ||
      raw.weights.some((w) => typeof w !== "number" || !Number.isFinite(w)) ||
      typeof raw.bias !== "number" ||
      !Number.isFinite(raw.bias)
    ) {
      return initModel();
    }
    return {
      version: MODEL_VERSION,
      weights: raw.weights.slice(),
      bias: raw.bias,
      learningRate:
        typeof raw.learningRate === "number" && raw.learningRate > 0
          ? raw.learningRate
          : DEFAULT_LEARNING_RATE,
      trainedExamples:
        typeof raw.trainedExamples === "number" && raw.trainedExamples >= 0
          ? raw.trainedExamples
          : 0,
    };
  } catch {
    return initModel();
  }
}

// --- math helpers ----------------------------------------------------------

function sigmoid(z: number): number {
  // Numerically stable for large-magnitude z.
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
