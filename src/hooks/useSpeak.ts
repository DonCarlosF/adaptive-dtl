import { useCallback, useEffect, useRef } from "react";

interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Called when speech ends (or fails to start). */
  onEnd?: () => void;
}

/**
 * Thin wrapper around the Web Speech API. The available voices vary by
 * browser/OS — we just pick the first English voice we find and trust
 * the platform default. Speech is cancelable; calling speak() while
 * something else is talking will replace it.
 */
export function useSpeak() {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    synthRef.current = window.speechSynthesis;
    const pickVoice = () => {
      const voices = synthRef.current?.getVoices() ?? [];
      voiceRef.current =
        voices.find(
          (v) => v.lang.startsWith("en") && /female|samantha|allison|karen/i.test(v.name),
        ) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        voices[0] ??
        null;
    };
    pickVoice();
    synthRef.current.addEventListener?.("voiceschanged", pickVoice);
    return () => {
      synthRef.current?.removeEventListener?.("voiceschanged", pickVoice);
    };
  }, []);

  const speak = useCallback((text: string, opts: SpeakOptions = {}) => {
    const synth = synthRef.current;
    if (!synth) {
      opts.onEnd?.();
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts.rate ?? 0.95;
    utter.pitch = opts.pitch ?? 1;
    utter.volume = opts.volume ?? 1;
    if (voiceRef.current) utter.voice = voiceRef.current;
    utter.onend = () => opts.onEnd?.();
    utter.onerror = () => opts.onEnd?.();
    synth.speak(utter);
  }, []);

  const cancel = useCallback(() => {
    synthRef.current?.cancel();
  }, []);

  return { speak, cancel };
}
