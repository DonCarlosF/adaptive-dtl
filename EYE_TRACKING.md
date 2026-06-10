# Eye Tracking — Architecture & Rollout

This document describes how eye tracking is wired into Adaptive DTL.

The app runs against one of two interchangeable gaze sources behind a
single pipeline: the real webcam (WebGazer.js) when the teacher opts into
camera tracking, or a built-in simulated stream otherwise. The simulator
is also the automatic fallback whenever a camera is unavailable, blocked,
or denied — so the pipeline always has input to work with.

## What's implemented

**Pipeline shape.** A real or simulated source feeds the same downstream
pipeline. From left to right:

```
Camera → WebGazer ─┐
                   ├→ gazeStore → gazeRules → adaptiveEngine → Session UI
SyntheticGaze ─────┘     ●           ●             ●               ●
  (fallback)
```

The source is selected in `gazeStore.enable(preferCamera)`: it tries the
real tracker first when requested and transparently falls back to the
simulator, recording the reason in `trackingError`.

- **`src/eyetracking/syntheticGaze.ts`** — generates samples at ~10Hz with three regimes: drift (gentle random walk near attractors), saccade (quick jump to a new attractor), and off-screen excursions of 1–6s every ~30s on average. Attractors are updated each trial with the prompt and choice-tile rectangles.
- **`src/eyetracking/gazeStore.ts`** — zustand store. When `eyeTrackingEnabled` is set in Settings, the store starts the synthetic generator, republishes samples through React, tracks `lastOnScreenAt`, and keeps a capped 150-second buffer for windowed rule evaluation.
- **`src/engine/gazeRules.ts`** — three real rules implemented against the standard `GazeWindow` shape:
  - `detectGazeOffScreen` — surface a `suggest-break` adaptation and decision patch when no on-screen sample for >5s.
  - `scoreLookBeforeAnswer` — surface a "guessed without looking" adaptation when the in-trial sample window contains <2 fixations on choice tiles.
  - `paceFromAttention` — classifies the trial's gaze window as steady / drifting / rough; logs an adaptation event when rough (>20% off-screen during the trial).
- **`StudentSession.tsx`** integration — composes gaze rule output with the response-based `reduce()` result, records every sample into a per-trial gaze trace, runs an off-screen watcher every 500ms during a trial that interrupts to the breathing-dot break if eyes are off >5s mid-trial, and persists the gaze trace into the saved `SessionRecord`.
- **`SessionReplay`** — scrubs a completed session, overlays the recorded simulated gaze trace per trial.
- **`GazeIndicator`** — small fading dot on screen tracking the simulated gaze, off by default for student-facing use, on for teacher demos. Always carries a "Simulated" badge so there's no ambiguity.
- **Calibration** (`calibration.tsx`) — full 5-point sequence with audio narration. Under real tracking each tap feeds WebGazer ~5 training samples anchored to the dot's screen position; under the simulated source the same UI runs without a camera. The inline note reflects which source is active.
- **Real WebGazer wrapper** (`webgazerWrapper.ts`) — loads WebGazer on demand via a `<script>` tag (kept out of the bundle), checks for camera support, calls `setRegression('ridge').setTracker('TFFacemesh').begin()`, hides the debug overlays, and emits predictions through a `setGazeListener` callback throttled to ~10Hz. Returns a typed `{ ok, reason }` so the store can fall back cleanly.
- **Source selection + fallback** (`gazeStore.ts`) — `enable(preferCamera)` starts the real tracker when requested, falls back to the simulator on any failure, and exposes the live `mode` (`"real" | "simulated" | "off"`) so the UI labels the source honestly.

## What's deferred / out of scope

- **Accuracy tuning** for difficult conditions (low light, glasses, off-axis heads). WebGazer's ridge regression is usable but not clinical; per-student recalibration prompts could help.
- **Vendoring the WebGazer script** instead of loading from the public CDN, for fully offline classrooms. Set `VITE_WEBGAZER_SRC` to a local copy to do this today.
- **A teacher-facing debug video toggle** to help position the camera.

## Why the camera is opt-in

- **Browser permission UX is fragile**. Camera prompts vary by browser, OS, and HTTPS. Defaulting to the simulator means the app always works; turning on the camera is a deliberate, reversible choice.
- **Demo reliability**. The simulated stream is reproducible. A real model on someone else's laptop is not — so demos and the test suite use the simulator.

## Why the simulator is worth keeping

The synthetic generator is not scaffolding to be deleted — it's a first-class fallback source, useful for:

- **Tests.** Deterministic gaze input makes the rules unit-testable.
- **Teacher demos in classrooms with no working camera.** A laptop with a covered webcam still demos the pipeline.
- **Recording-to-replay regression checks.** A saved synthetic trace plus a known seed reproduces an entire session.

## Files that touch eye tracking

| File                                   | Role                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/eyetracking/webgazerWrapper.ts`   | Real WebGazer integration: on-demand script load, camera init, throttled predictions, calibration recording. |
| `src/eyetracking/calibration.tsx`      | 5-point UI. Records real training samples under camera tracking; demo flow otherwise. |
| `src/eyetracking/gazeStore.ts`         | Source selection (real vs simulated) + fallback; republishes samples; exposes `mode`. |
| `src/eyetracking/syntheticGaze.ts`     | The simulator — the default source and the camera fallback. Kept for tests and demos. |
| `src/engine/gazeRules.ts`              | Rules. Source-agnostic — same `GazeSample` shape for real and simulated.            |
| `src/components/GazeIndicator.tsx`     | Overlay dot. Shows a "Simulated" badge only when the source is the simulator.       |
| `src/pages/StudentSession.tsx`         | Integration point: enables the chosen source per settings, releases it on exit.     |
| `src/pages/SessionReplay.tsx`          | Replay — overlays the recorded gaze trace (real or simulated) per trial.            |

## A note on framing

The pipeline is deliberately source-agnostic: the rules, recording, and
replay consume the same `GazeSample` shape whether it came from a webcam
or the simulator. That's what lets the camera be a clean opt-in rather
than a rewrite — and lets the whole system be exercised by the test
suite and demoed on a laptop with no working camera.
