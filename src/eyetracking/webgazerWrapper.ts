// PASS 2: Replace mock implementation with real WebGazer.js integration.
//
// This module owns the lifetime of the gaze tracker so the rest of the
// app doesn't have to know which library is wrapped. The contract:
//
//   await initGazeTracking()  →  start the tracker, request camera,
//                                 begin emitting samples.
//   getCurrentGaze()         →  most recent sample or null if unknown.
//   shutdown()               →  release camera, stop the tracker.
//
// In pass 1 these all return mock data so the calibration UI and gaze
// store can be developed and demoed without a webcam.

import { GazeSample } from "@/engine/gazeRules";

let active = false;

export async function initGazeTracking(): Promise<{ ok: boolean; reason?: string }> {
  // PASS 2: await webgazer init, request user-facing camera, attach predictionListener.
  active = true;
  return { ok: true };
}

export function getCurrentGaze(): GazeSample | null {
  if (!active) return null;
  // PASS 2: return real WebGazer prediction. For pass 1 we return null
  // so the engine never branches on stale mock fixations.
  return null;
}

export async function shutdown(): Promise<void> {
  // PASS 2: webgazer.end(); release video element; stop streams.
  active = false;
}

export function isActive(): boolean {
  return active;
}
