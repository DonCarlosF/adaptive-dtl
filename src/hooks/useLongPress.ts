import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  durationMs: number;
  onComplete: () => void;
}

interface Bindings {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

interface State {
  /** 0..1 progress while held; 0 when not held. */
  progress: number;
  active: boolean;
  bind: Bindings;
}

/**
 * Hold-to-confirm. Tracks progress every animation frame so the caller
 * can render a ring or fill. Cancels cleanly on lift, leave, or cancel.
 */
export function useLongPress({ durationMs, onComplete }: Options): State {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setActive(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    const start = startRef.current;
    if (start == null) return;
    const elapsed = performance.now() - start;
    const p = Math.min(1, elapsed / durationMs);
    setProgress(p);
    if (p >= 1) {
      stop();
      completeRef.current();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, stop]);

  const start = useCallback(
    (e: React.PointerEvent) => {
      // Capture pointer so we keep getting events even if the finger drifts
      // off the element a little.
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
      startRef.current = performance.now();
      setActive(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  useEffect(() => stop, [stop]);

  return {
    progress,
    active,
    bind: {
      onPointerDown: start,
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    },
  };
}
