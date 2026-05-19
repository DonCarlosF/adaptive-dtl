// SIMULATED — see EYE_TRACKING.md
//
// Pass 2: the store no longer holds null forever. When eye tracking is
// "enabled" in settings, the store starts a `SyntheticGaze` instance and
// republishes samples through zustand. Components that previously had
// no signal now receive ~10Hz updates that look believable enough for
// the gaze rules and the indicator overlay to do real work.

import { create } from "zustand";
import { GazeSample } from "@/engine/gazeRules";
import { SyntheticGaze } from "./syntheticGaze";

interface GazeState {
  enabled: boolean;
  calibrating: boolean;
  /** 0..1 calibration progress; 1 = fully calibrated. */
  calibrationProgress: number;
  /** Last gaze sample, or null if unknown / disabled. */
  latest: GazeSample | null;
  /** ms timestamp of the last on-screen sample (for off-screen detection). */
  lastOnScreenAt: number | null;
  /** Recording buffer for the active session — capped to MAX_BUFFER. */
  buffer: GazeSample[];

  setEnabled: (enabled: boolean) => void;
  startCalibration: () => void;
  advanceCalibration: (step: number, totalSteps: number) => void;
  finishCalibration: () => void;
  pushSample: (sample: GazeSample) => void;
  resetBuffer: () => void;
}

const MAX_BUFFER = 1500; // ~150s at 10Hz

export const useGazeStore = create<GazeState>((set) => ({
  enabled: false,
  calibrating: false,
  calibrationProgress: 0,
  latest: null,
  lastOnScreenAt: null,
  buffer: [],

  setEnabled: (enabled) => {
    set({ enabled, latest: enabled ? null : null });
    if (enabled) startSimulator();
    else stopSimulator();
  },
  startCalibration: () => set({ calibrating: true, calibrationProgress: 0 }),
  advanceCalibration: (step, totalSteps) =>
    set({ calibrationProgress: Math.min(1, step / totalSteps) }),
  finishCalibration: () => set({ calibrating: false, calibrationProgress: 1 }),
  pushSample: (sample) =>
    set((s) => {
      const onScreen = isOnScreen(sample);
      const buffer = s.buffer.length >= MAX_BUFFER ? s.buffer.slice(-MAX_BUFFER + 1) : s.buffer;
      return {
        latest: sample,
        lastOnScreenAt: onScreen ? sample.timestamp : s.lastOnScreenAt,
        buffer: [...buffer, sample],
      };
    }),
  resetBuffer: () => set({ buffer: [], lastOnScreenAt: null }),
}));

function isOnScreen(s: GazeSample): boolean {
  return (
    s.x >= 0 &&
    s.x <= window.innerWidth &&
    s.y >= 0 &&
    s.y <= window.innerHeight
  );
}

let simulator: SyntheticGaze | null = null;
let unsubscribe: (() => void) | null = null;

function startSimulator(): void {
  if (simulator) return;
  simulator = new SyntheticGaze({
    width: window.innerWidth,
    height: window.innerHeight,
    attractors: [],
  });
  unsubscribe = simulator.subscribe((s) => useGazeStore.getState().pushSample(s));
  simulator.start();

  window.addEventListener("resize", handleResize);
}

function stopSimulator(): void {
  if (!simulator) return;
  simulator.stop();
  unsubscribe?.();
  simulator = null;
  unsubscribe = null;
  window.removeEventListener("resize", handleResize);
  useGazeStore.getState().resetBuffer();
}

function handleResize(): void {
  simulator?.updateConfig({
    width: window.innerWidth,
    height: window.innerHeight,
  });
}

/**
 * Update the simulator's attractor rectangles — the prompt area and
 * choice tiles for the current trial. Called by the StudentSession on
 * each new trial.
 */
export function setGazeAttractors(rects: DOMRect[]): void {
  simulator?.updateConfig({ attractors: rects });
}

/** Read-only snapshot of the current store state, for one-off reads. */
export function readGazeSnapshot() {
  const s = useGazeStore.getState();
  return {
    enabled: s.enabled,
    latest: s.latest,
    lastOnScreenAt: s.lastOnScreenAt,
    buffer: s.buffer,
  };
}
