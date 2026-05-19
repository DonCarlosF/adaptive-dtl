import { useCallback, useEffect, useRef } from "react";

/**
 * Soft positive chime via Web Audio. Two short sine notes, gently
 * enveloped — meant to feel like "yes, that's it" rather than "ding!".
 * Volume is multiplied by the caller-supplied value (0..1) from settings.
 */
export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, []);

  const chime = useCallback(
    (volume = 0.7) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      const playNote = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.18 * volume, now + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + start + duration,
        );
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + duration + 0.05);
      };

      playNote(660, 0, 0.18); // E5
      playNote(880, 0.12, 0.22); // A5
    },
    [ensureCtx],
  );

  return { chime };
}
