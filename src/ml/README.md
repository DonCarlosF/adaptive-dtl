# `src/ml/` — On-device adaptive ML

A lightweight, fully on-device machine-learning layer that sits **on top
of** the rule-based engine (`src/engine/`). It adds two learned/inferred
signals and an advisory recommendation — it never overrides the engine's
safety rules.

## Why no TensorFlow.js (or any heavy ML dep)

This is a deliberate architectural choice, not a shortcut:

- **Bundle budget.** `@tensorflow/tfjs` is multiple MB and would dwarf the
  app's current payload (see `BUNDLE.md`). The problems here are
  low-dimensional and linear/heuristic — they do not need a tensor runtime.
- **Offline-first + privacy.** Everything runs and trains on the device.
  No model download, no WASM/WebGL backend negotiation, no network. Student
  gaze and performance data never leave the browser.
- **Auditability.** A teacher-facing special-ed tool should be able to
  explain *why* it adapted. Logistic-regression weights and a handful of
  named gaze features are inspectable; a black-box net is not.
- **Testability & determinism.** Pure TypeScript functions give us exact,
  reproducible unit tests over the math (convergence, monotonicity,
  serialization round-trips).

The trade-off — no deep representation learning — is the right one for this
signal. If a genuinely non-linear model is ever needed, the model interface
(`predict` / `update` / `serialize`) is the seam to swap behind.

## Modules

| File | Responsibility |
| --- | --- |
| `attentionModel.ts` | Pure `scoreAttention(samples, viewport)` → engagement `score` (0..1), `label` (`focused`/`variable`/`disengaged`), and the normalized `features` (on-screen ratio, fixation stability, saccade regularity, velocity calmness). |
| `difficultyModel.ts` | Online **logistic regression** (SGD) predicting P(correct) for the next trial. Immutable `update`, `predict`, `initModel`, `recommend` (advisory `MLDecision`), and serialize/deserialize helpers. |
| `sessionFeatures.ts` | Pure bridge from `SessionState` trials + attention score into the difficulty model's feature object. |

Persistence lives in `src/db/mlModelRepo.ts` (Dexie v3 `mlModels` table,
keyed by `${studentId}::${domain}`). The model is loaded on session start,
updated per trial, and saved on session end — so it learns **across**
sessions.

## How it composes into a session

1. After the rule-based `reduce` (and the existing gaze-rule composition)
   in `StudentSession.tsx`, we score attention from the gaze buffer.
2. We featurize the session state + attention and ask the difficulty model
   for an `MLDecision` (raise / hold / lower + confidence).
3. The decision is surfaced as an **advisory adaptation event** (so it
   shows in the dashboard adaptation log) and may gently bias `numChoices`
   **only in the safe direction** — it never reverses a safety drop or an
   early-end, and only nudges when confidence is sufficient.
4. We then `update` the model with the trial's actual outcome and persist
   on session-done.

## Safety contract

The ML layer is **strictly additive and advisory**. The rule engine's
decisions — forced drop to 2 choices on two misses, suggested breaks,
early-end on low accuracy — always win. The ML layer can only make a trial
*easier* than the rules already allow, or hold; it can raise difficulty
only when the rules have not just intervened.
