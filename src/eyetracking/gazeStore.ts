// Gaze store — owns the active gaze source and republishes samples.
//
// Two sources share one downstream pipeline (gaze rules, recording,
// indicator overlay):
//
//   - "real"      — WebGazer.js predictions from the webcam (see
//                   webgazerWrapper.ts), used when the teacher opts into
//                   camera tracking and the camera/library are available.
//   - "simulated" — the ~10Hz SyntheticGaze stream, used when camera
//                   tracking is off, unavailable, or denied. Kept on
//                   purpose for tests and no-camera demos (EYE_TRACKING.md).
//
// `enable(preferCamera)` tries the requested source and transparently
// falls back to simulated, recording why in `trackingError`.

import { create } from "zustand";
import { GazeSample } from "@/engine/gazeRules";
import { SyntheticGaze } from "./syntheticGaze";

export type GazeMode = "off" | "simulated" | "real";

interface GazeState {
  mode: GazeMode;
  /** Convenience: true whenever a source is running. */
  enabled: boolean;
  /** Set when a requested camera source fell back to simulated. */
  trackingError: string | null;
  calibrating: boolean;
  /** 0..1 calibration progress; 1 = fully calibrated. */
  calibrationProgress: number;
  /** Last gaze sample, or null if unknown / disabled. */
  latest: GazeSample | null;
  /** ms timestamp of the last on-screen sample (for off-screen detection). */
  lastOnScreenAt: number | null;
  /** Recording buffer for the active session — capped to MAX_BUFFER. */
  buffer: GazeSample[];

  /** Start a gaze source. Returns the mode actually started. */
  enable: (preferCamera: boolean) => Promise<GazeMode>;
  /** Stop the active source and release the camera if one was in use. */
  disable: () => void;
  startCalibration: () => void;
  advanceCalibration: (step: number, totalSteps: number) => void;
  finishCalibration: () => void;
  pushSample: (sample: GazeSample) => void;
  resetBuffer: () => void;
}

const MAX_BUFFER = 1500; // ~150s at 10Hz

export const useGazeStore = create<GazeState>((set, get) => ({
  mode: "off",
  enabled: false,
  trackingError: null,
  calibrating: false,
  calibrationProgress: 0,
  latest: null,
  lastOnScreenAt: null,
  buffer: [],

  enable: async (preferCamera) => {
    if (get().mode !== "off") return get().mode;

    if (preferCamera) {
      const { initGazeTracking } = await import("./webgazerWrapper");
      const res = await initGazeTracking({
        onSample: (s) => get().pushSample(s),
      });
      if (res.ok) {
        set({ mode: "real", enabled: true, trackingError: null });
        return "real";
      }
      // Fall back to the simulator, but tell the teacher why.
      startSimulator();
      set({
        mode: "simulated",
        enabled: true,
        trackingError:
          (res.reason ?? "Camera unavailable.") + " Using simulated gaze.",
      });
      return "simulated";
    }

    startSimulator();
    set({ mode: "simulated", enabled: true, trackingError: null });
    return "simulated";
  },

  disable: () => {
    const mode = get().mode;
    if (mode === "real") {
      void import("./webgazerWrapper").then((m) => m.shutdown());
    } else if (mode === "simulated") {
      stopSimulator();
    }
    set({ mode: "off", enabled: false, latest: null });
    get().resetBuffer();
  },

  startCalibration: () => set({ calibrating: true, calibrationProgress: 0 }),
  advanceCalibration: (step, totalSteps) =>
    set({ calibrationProgress: Math.min(1, step / totalSteps) }),
  finishCalibration: () => set({ calibrating: false, calibrationProgress: 1 }),
  pushSample: (sample) =>
    set((s) => {
      const onScreen = isOnScreen(sample);
      const buffer =
        s.buffer.length >= MAX_BUFFER ? s.buffer.slice(-MAX_BUFFER + 1) : s.buffer;
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
 * each new trial. A no-op under real tracking (no attractors to bias).
 */
export function setGazeAttractors(rects: DOMRect[]): void {
  simulator?.updateConfig({ attractors: rects });
}

/** Read-only snapshot of the current store state, for one-off reads. */
export function readGazeSnapshot() {
  const s = useGazeStore.getState();
  return {
    enabled: s.enabled,
    mode: s.mode,
    latest: s.latest,
    lastOnScreenAt: s.lastOnScreenAt,
    buffer: s.buffer,
  };
}
