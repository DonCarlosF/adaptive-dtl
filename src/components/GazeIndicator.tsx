// A small fading dot at the current gaze position. Off by default for
// student-facing use; teachers can turn it on in Settings to demo the
// gaze pipeline. When the source is the simulator (not the camera) the
// dot carries a "Simulated" badge so there's no ambiguity about what's
// driving it.

import { useEffect, useRef, useState } from "react";
import { useGazeStore } from "@/eyetracking/gazeStore";

interface Props {
  /** Hide entirely when false (e.g. student-facing). */
  enabled: boolean;
}

const DOT_SIZE = 22;

export function GazeIndicator({ enabled }: Props) {
  const latest = useGazeStore((s) => s.latest);
  const mode = useGazeStore((s) => s.mode);
  const [trail, setTrail] = useState<{ x: number; y: number; ts: number }[]>([]);
  const trailRef = useRef(trail);
  trailRef.current = trail;

  useEffect(() => {
    if (!enabled || !latest) return;
    const next = [
      ...trailRef.current,
      { x: latest.x, y: latest.y, ts: latest.timestamp },
    ].slice(-10);
    setTrail(next);
  }, [latest, enabled]);

  if (!enabled || !latest) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30"
      aria-hidden
    >
      {trail.map((p, i) => (
        <div
          key={p.ts}
          className="absolute rounded-full"
          style={{
            left: p.x - DOT_SIZE / 2,
            top: p.y - DOT_SIZE / 2,
            width: DOT_SIZE,
            height: DOT_SIZE,
            backgroundColor: "#7BA098",
            opacity: ((i + 1) / trail.length) * 0.35,
            transition: "opacity 200ms linear",
          }}
        />
      ))}
      <div
        className="absolute rounded-full ring-2 ring-sage-500/60"
        style={{
          left: latest.x - DOT_SIZE / 2,
          top: latest.y - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          backgroundColor: "#7BA098",
        }}
      />
      {mode === "simulated" && (
        <div
          className="absolute text-[10px] uppercase tracking-wider text-muted bg-white/90 border border-line rounded-full px-2 py-0.5"
          style={{
            left: latest.x + DOT_SIZE,
            top: latest.y + DOT_SIZE / 2 - 8,
          }}
        >
          Simulated
        </div>
      )}
    </div>
  );
}
