import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
} from "./speechRecognitionTypes";
import { matchSpoken, SpokenChoice, SpokenMatch } from "./matchSpoken";

interface Options {
  /** Choices to match the spoken answer against (current trial). */
  choices: SpokenChoice[];
  /** Fired once on a confident match, with the matched choice id. */
  onMatch: (match: SpokenMatch) => void;
  /** BCP-47 language tag. Defaults to en-US. */
  lang?: string;
}

interface SpeechRecognitionApi {
  /** True when the Web Speech API is available in this browser. */
  supported: boolean;
  /** True while actively listening. */
  listening: boolean;
  /** Latest interim/final transcript, for an on-screen indicator. */
  transcript: string;
  /** Last recognition error code, if any (e.g. "not-allowed"). */
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Web Speech API wrapper for spoken-answer input.
 *
 * Feature-detected and graceful: when `SpeechRecognition` is unavailable the
 * hook is an inert no-op with `supported: false`, so callers can hide the
 * mic affordance without branching everywhere.
 *
 * On each result it runs {@link matchSpoken} against the live `choices`. The
 * matcher is read through a ref so a long-lived recognition session always
 * compares against the *current* trial's choices without restarting the
 * recognizer. A confident match fires `onMatch` exactly once per utterance.
 */
export function useSpeechRecognition(opts: Options): SpeechRecognitionApi {
  const ctor = getSpeechRecognitionCtor();
  const supported = ctor !== null;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep latest opts in a ref so recognition callbacks see fresh choices.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Guard so we only fire onMatch once between explicit start() calls.
  const firedRef = useRef(false);

  // Build (lazily) and configure the recognizer instance.
  useEffect(() => {
    if (!ctor) return;
    const rec = new ctor();
    rec.lang = opts.lang ?? "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(e.error);
      setListening(false);
    };
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? "";
      }
      setTranscript(text);
      if (firedRef.current) return;
      const match = matchSpoken(text, optsRef.current.choices);
      if (match) {
        firedRef.current = true;
        optsRef.current.onMatch(match);
      }
    };

    recognitionRef.current = rec;
    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try {
        rec.abort();
      } catch {
        /* abort can throw if never started — safe to ignore */
      }
      recognitionRef.current = null;
    };
    // Re-create only when the constructor/lang identity changes.
  }, [ctor, opts.lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    firedRef.current = false;
    setTranscript("");
    try {
      rec.start();
    } catch {
      // start() throws if already running — treat as a no-op.
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  return { supported, listening, transcript, error, start, stop };
}
