# Eye Tracking — Architecture & Rollout

This document describes how eye tracking is wired into Adaptive DTL today and what changes when a real camera-backed implementation lands.

## What's implemented

**Pipeline shape.** The full downstream pipeline runs against a believable input — only the camera and model are mocked. From left to right:

```
Camera → WebGazer → gazeStore → gazeRules → adaptiveEngine → Session UI
  ◌         ◌          ●           ●             ●               ●
            ↑ deferred              ↑ all built and exercised in pass 2
```

- **`src/eyetracking/syntheticGaze.ts`** — generates samples at ~10Hz with three regimes: drift (gentle random walk near attractors), saccade (quick jump to a new attractor), and off-screen excursions of 1–6s every ~30s on average. Attractors are updated each trial with the prompt and choice-tile rectangles.
- **`src/eyetracking/gazeStore.ts`** — zustand store. When `eyeTrackingEnabled` is set in Settings, the store starts the synthetic generator, republishes samples through React, tracks `lastOnScreenAt`, and keeps a capped 150-second buffer for windowed rule evaluation.
- **`src/engine/gazeRules.ts`** — three real rules implemented against the standard `GazeWindow` shape:
  - `detectGazeOffScreen` — surface a `suggest-break` adaptation and decision patch when no on-screen sample for >5s.
  - `scoreLookBeforeAnswer` — surface a "guessed without looking" adaptation when the in-trial sample window contains <2 fixations on choice tiles.
  - `paceFromAttention` — classifies the trial's gaze window as steady / drifting / rough; logs an adaptation event when rough (>20% off-screen during the trial).
- **`StudentSession.tsx`** integration — composes gaze rule output with the response-based `reduce()` result, records every sample into a per-trial gaze trace, runs an off-screen watcher every 500ms during a trial that interrupts to the breathing-dot break if eyes are off >5s mid-trial, and persists the gaze trace into the saved `SessionRecord`.
- **`SessionReplay`** — scrubs a completed session, overlays the recorded simulated gaze trace per trial.
- **`GazeIndicator`** — small fading dot on screen tracking the simulated gaze, off by default for student-facing use, on for teacher demos. Always carries a "Simulated" badge so there's no ambiguity.
- **Calibration UI** (`calibration.tsx`) — full 5-point sequence with audio narration and a "Demo calibration — real WebGazer.js integration is the next milestone" note rendered inline.

## What's deferred

- **WebGazer.js script load + model init** in `webgazerWrapper.ts`.
- **Real per-point training** in `calibration.tsx` — replacing the tap-to-advance with WebGazer's `setRegression().recordScreenPosition()` calls.
- **Real prediction stream** in `gazeStore.ts` — replacing the synthetic generator with WebGazer's `setGazeListener()` callback, throttled to ~10Hz.

## Why deferred

- **Browser permission UX is fragile**. Camera access prompts vary by browser, OS, and whether the page is served over HTTPS. The "Adaptive DTL booted on a hiring manager's laptop" demo shouldn't depend on any of that working out of the box.
- **WebGazer accuracy varies a lot** with lighting, head position, glasses, and webcam quality. A flaky integration sends a worse signal about engineering thinking than a clean simulation does.
- **Demo reliability**. The simulated stream is reproducible. A real model on someone else's laptop is not.
- **The interesting work is downstream**. The rules, the recording, the dashboard surfacing — those are where the engineering judgment lives, and they all run today.

## Estimated implementation path

A focused ~3-day swap, no architectural changes:

**Day 1 — script load + init.** `webgazerWrapper.ts`: load WebGazer (`https://webgazer.cs.brown.edu/webgazer.js`, or vendor a copy), call `webgazer.setRegression('ridge').setTracker('TFFacemesh').begin()`, surface ready/error state. Hide the WebGazer debug video element by default; expose a teacher-only debug toggle.

**Day 2 — calibration.** Replace each calibration dot's `handleTap` with `webgazer.recordScreenPosition(x, y, 'click')` calls (5 points × ~5 samples each is the minimum that works). Keep the existing UI; add a per-point progress fill so the teacher knows the model is collecting samples.

**Day 3 — live stream + cleanup.** In `gazeStore.startSimulator`, replace the `SyntheticGaze` instantiation with a `webgazer.setGazeListener((data, ts) => pushSample({ x: data.x, y: data.y, timestamp: ts, confidence: 0.7 }))`. Throttle inside the listener to 10Hz (WebGazer can fire much faster). Call `webgazer.end()` on shutdown. Drop the synthetic-gaze import from production builds via the unused-export pruning.

## Why the simulator is worth keeping

Even after real cameras land, the synthetic generator is useful for:

- **Tests.** Deterministic gaze input makes the rules unit-testable.
- **Teacher demos in classrooms with no working camera.** A laptop with a covered webcam still demos the pipeline.
- **Recording-to-replay regression checks.** A saved synthetic trace plus a known seed reproduces an entire session.

## Files that touch eye tracking

| File                                   | Role                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/eyetracking/webgazerWrapper.ts`   | Pass-1 stub. Pass-3 (real) work happens here.                                       |
| `src/eyetracking/calibration.tsx`      | Real UI, mock per-point recording. Pass-3 swap in `handleTap`.                      |
| `src/eyetracking/gazeStore.ts`         | Synthetic stream → store. Pass-3 swap of the inner generator.                       |
| `src/eyetracking/syntheticGaze.ts`     | The simulator. Kept after pass 3 for tests and demos.                               |
| `src/engine/gazeRules.ts`              | Rules. No change in pass 3.                                                         |
| `src/components/GazeIndicator.tsx`     | Overlay dot. No change in pass 3 except removing the "Simulated" badge.             |
| `src/pages/StudentSession.tsx`         | Integration point. No change in pass 3.                                             |
| `src/pages/SessionReplay.tsx`          | Replay. No change in pass 3.                                                        |

## A note on framing

The point of building this seam carefully — implementing the rules, recording, and replay against simulated input — is that a hiring manager reading the code or running a demo can verify the architecture works without my having to demo a webcam integration on their laptop. That's a more honest signal than a half-working camera demo would be.
