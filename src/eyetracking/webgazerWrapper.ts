// Real WebGazer.js integration.
//
// This module owns the lifetime of the gaze tracker so the rest of the
// app doesn't have to know which library is wrapped. The contract:
//
//   await initGazeTracking({ onSample })  →  load WebGazer, request the
//                                 camera, begin emitting throttled samples.
//   getCurrentGaze()         →  most recent sample or null if unknown.
//   recordCalibrationPoint() →  feed a click-anchored training sample.
//   shutdown()               →  release camera, stop the tracker.
//
// WebGazer is loaded on demand via a <script> tag (not bundled) so the
// dashboard payload never carries it. If the script can't load or the
// camera is unavailable/denied, init resolves with `ok: false` and the
// caller falls back to the synthetic stream — see `gazeStore.ts`.

import { GazeSample } from "@/engine/gazeRules";

/** Minimal structural type for the parts of WebGazer's global API we use. */
interface WebGazer {
  setRegression(name: string): WebGazer;
  setTracker(name: string): WebGazer;
  setGazeListener(
    cb: (data: { x: number; y: number } | null, ts: number) => void,
  ): WebGazer;
  begin(): Promise<void>;
  end(): void;
  recordScreenPosition(x: number, y: number, eventType: string): void;
  showVideoPreview(show: boolean): WebGazer;
  showPredictionPoints(show: boolean): WebGazer;
  showFaceOverlay(show: boolean): WebGazer;
  showFaceFeedbackBox(show: boolean): WebGazer;
}

declare global {
  interface Window {
    webgazer?: WebGazer;
  }
}

/** Public CDN copy. Override via VITE_WEBGAZER_SRC to vendor a local copy. */
const DEFAULT_WEBGAZER_SRC = "https://webgazer.cs.brown.edu/webgazer.js";
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;
const MIN_SAMPLE_INTERVAL_MS = 100; // throttle predictions to ~10Hz
const FIXED_CONFIDENCE = 0.7; // WebGazer gives no confidence; see EYE_TRACKING.md

let active = false;
let latest: GazeSample | null = null;
let lastEmit = 0;
let scriptPromise: Promise<boolean> | null = null;

export interface InitOptions {
  /** Called with each throttled gaze sample. */
  onSample?: (sample: GazeSample) => void;
  /** Override the WebGazer script URL. */
  scriptSrc?: string;
}

function loadWebGazerScript(src: string): Promise<boolean> {
  if (window.webgazer) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-webgazer]`,
    );
    if (existing && window.webgazer) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.webgazer = "true";
    const timer = window.setTimeout(() => {
      script.remove();
      resolve(false);
    }, SCRIPT_LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      resolve(Boolean(window.webgazer));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function initGazeTracking(
  opts: InitOptions = {},
): Promise<{ ok: boolean; reason?: string }> {
  if (active) return { ok: true };

  // The browser must be able to grant camera access at all.
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return { ok: false, reason: "Camera API unavailable in this browser." };
  }

  const src = opts.scriptSrc ?? DEFAULT_WEBGAZER_SRC;
  const loaded = await loadWebGazerScript(src);
  if (!loaded || !window.webgazer) {
    scriptPromise = null; // allow a later retry
    return { ok: false, reason: "Could not load the eye-tracking library." };
  }

  const wg = window.webgazer;
  try {
    wg.setRegression("ridge").setTracker("TFFacemesh");
    wg.setGazeListener((data, ts) => {
      if (!data) return;
      const now = ts || Date.now();
      if (now - lastEmit < MIN_SAMPLE_INTERVAL_MS) return;
      lastEmit = now;
      const sample: GazeSample = {
        x: data.x,
        y: data.y,
        timestamp: Date.now(),
        confidence: FIXED_CONFIDENCE,
      };
      latest = sample;
      opts.onSample?.(sample);
    });
    // begin() requests the camera; rejects if denied or unavailable.
    await wg.begin();
    // Keep WebGazer's debug overlays off for student-facing use.
    wg.showVideoPreview(false)
      .showPredictionPoints(false)
      .showFaceOverlay(false)
      .showFaceFeedbackBox(false);
    active = true;
    return { ok: true };
  } catch (err) {
    try {
      wg.end();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason:
        (err as Error)?.message ??
        "Camera permission denied or tracker failed to start.",
    };
  }
}

export function getCurrentGaze(): GazeSample | null {
  return active ? latest : null;
}

/**
 * Feed a calibration training sample at a screen position the student is
 * looking at (anchored to their tap on the calibration dot).
 */
export function recordCalibrationPoint(x: number, y: number): void {
  if (!active) return;
  window.webgazer?.recordScreenPosition(x, y, "click");
}

export async function shutdown(): Promise<void> {
  if (window.webgazer) {
    try {
      window.webgazer.end();
    } catch {
      /* ignore */
    }
  }
  active = false;
  latest = null;
  lastEmit = 0;
}

export function isActive(): boolean {
  return active;
}
