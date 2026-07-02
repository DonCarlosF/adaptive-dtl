// Calibration overlay.
//
// Sequence: 5 dots in a corners-and-center pattern, audio narration, tap
// each dot while looking at it. Under real (camera) tracking each tap
// feeds WebGazer a training sample anchored to the dot's screen position
// (a few samples per point — the minimum that meaningfully improves the
// ridge regression). Under the simulated source the same UI runs without
// a camera so the flow can be demoed anywhere.

import { useEffect, useState } from "react";
import { useSpeak } from "@/hooks/useSpeak";
import { Button } from "@/components/Button";
import { useGazeStore } from "./gazeStore";

const POINTS: Array<{ x: string; y: string }> = [
  { x: "50%", y: "50%" },
  { x: "10%", y: "10%" },
  { x: "90%", y: "10%" },
  { x: "10%", y: "90%" },
  { x: "90%", y: "90%" },
];

/** Samples fed to WebGazer per calibration point. */
const SAMPLES_PER_POINT = 5;

interface Props {
  onClose: () => void;
  /** Prefer the real webcam source for this calibration session. */
  cameraTracking?: boolean;
}

export function CalibrationOverlay({ onClose, cameraTracking = false }: Props) {
  const [step, setStep] = useState(0);
  const { speak, cancel } = useSpeak();
  const { startCalibration, advanceCalibration, finishCalibration, enable } =
    useGazeStore();
  const mode = useGazeStore((s) => s.mode);

  useEffect(() => {
    startCalibration();
    // Ensure a gaze source is running so taps can train the model. Left
    // running on close so the calibrated model carries into the session.
    if (useGazeStore.getState().mode === "off") {
      void enable(cameraTracking);
    }
    speak("Look at the dot, then tap it. We will do this five times.");
    return () => cancel();
  }, [speak, cancel, startCalibration, enable, cameraTracking]);

  const recordReal = (el: HTMLElement) => {
    if (useGazeStore.getState().mode !== "real") return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    void import("./webgazerWrapper").then((m) => {
      for (let i = 0; i < SAMPLES_PER_POINT; i++) {
        m.recordCalibrationPoint(cx, cy);
      }
    });
  };

  const handleTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    recordReal(e.currentTarget);
    const next = step + 1;
    advanceCalibration(next, POINTS.length);
    if (next >= POINTS.length) {
      finishCalibration();
      speak("All set. Calibration complete.");
      setTimeout(onClose, 700);
      return;
    }
    setStep(next);
    speak("Now look at the next dot.");
  };

  const point = POINTS[step] ?? POINTS[0];

  return (
    <div className="fixed inset-0 z-50 bg-canvas">
      <div className="absolute top-6 left-6 text-muted text-sm">
        Calibration {step + 1} / {POINTS.length}
      </div>
      <div className="absolute top-6 left-1/2 -translate-x-1/2 text-xs text-muted bg-white/80 border border-line rounded-full px-3 py-1.5 max-w-md text-center">
        {mode === "real"
          ? "Camera calibration — look directly at each dot before tapping."
          : "Simulated calibration — enable camera tracking in Settings to train the real model."}
      </div>
      <button
        onClick={handleTap}
        aria-label={`Calibration point ${step + 1}`}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-sage shadow-card animate-breathe focus:outline-none focus-visible:ring-4 focus-visible:ring-sage-200"
        style={{ left: point.x, top: point.y }}
      />
      <div className="absolute bottom-6 right-6">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
