// PASS 2: Wire each dot tap to actually feed WebGazer's training set.
//
// Pass-1 calibration UI. Sequence: 5 dots in a corners-and-center pattern,
// audio narration ("Look at the dot…"), tap to advance. The UI here is
// the real one we want to ship — only the gaze training is mocked.

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

interface Props {
  onClose: () => void;
}

export function CalibrationOverlay({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const { speak, cancel } = useSpeak();
  const { startCalibration, advanceCalibration, finishCalibration } =
    useGazeStore();

  useEffect(() => {
    startCalibration();
    speak("Look at the dot, then tap it. We will do this five times.");
    return () => cancel();
  }, [speak, cancel, startCalibration]);

  const handleTap = () => {
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
        Demo calibration — real WebGazer.js integration is the next milestone.
        See <code className="text-ink">EYE_TRACKING.md</code> for the architecture.
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
