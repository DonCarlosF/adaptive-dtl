// SIMULATED — see EYE_TRACKING.md
//
// Synthetic gaze generator. Models a slow drifting attractor with three
// regimes:
//
//   - "drift"   — gentle random walk near the current fixation target
//   - "saccade" — quick jump to a new attractor (chosen from an updated
//                 list of choice-tile rectangles, plus the prompt area)
//   - "off"     — gaze leaves the viewport for 1–6 seconds (rare, but
//                 frequent enough to demo the off-screen break rule)
//
// The numbers below are tuned for "looks plausible during a demo," not
// for fidelity to any particular eye-tracking dataset.

import { GazeSample } from "@/engine/gazeRules";

export interface SyntheticConfig {
  /** Viewport width/height in CSS pixels. */
  width: number;
  height: number;
  /**
   * Rectangles the gaze should be biased toward (prompt area + choice
   * tiles). Pass an empty array for "fixation target = center".
   */
  attractors: DOMRect[];
}

type Regime = "drift" | "saccade" | "off";

interface Internal {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  regime: Regime;
  /** ms remaining in current regime. */
  regimeMs: number;
  /** True while inside an off-screen excursion. */
  off: boolean;
}

const TICK_MS = 100; // 10Hz

/** Probability of starting an off-screen excursion per tick (≈1 every 30s avg). */
const P_OFF_PER_TICK = 0.003;

/** Probability of starting a saccade per tick during drift (≈3/s avg). */
const P_SACCADE_PER_TICK = 0.3;

export class SyntheticGaze {
  private config: SyntheticConfig;
  private state: Internal;
  private timer: number | null = null;
  private listeners = new Set<(s: GazeSample) => void>();

  constructor(config: SyntheticConfig) {
    this.config = config;
    this.state = {
      x: config.width / 2,
      y: config.height / 2,
      targetX: config.width / 2,
      targetY: config.height / 2,
      regime: "drift",
      regimeMs: 800,
      off: false,
    };
  }

  updateConfig(patch: Partial<SyntheticConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  start(): void {
    if (this.timer != null) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(fn: (s: GazeSample) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private tick(): void {
    const s = this.state;

    // Decay current regime; pick a new one when it expires.
    s.regimeMs -= TICK_MS;
    if (s.regimeMs <= 0) {
      this.pickNextRegime();
    }

    if (s.regime === "off") {
      // Drift further off-screen, gently.
      s.x += rand(-3, 3);
      s.y += rand(-2, 2);
      // Hold the off flag while regimeMs > 0.
      s.off = true;
    } else {
      // Move a step toward the target with gentle jitter.
      s.x += (s.targetX - s.x) * 0.18 + rand(-3, 3);
      s.y += (s.targetY - s.y) * 0.18 + rand(-2, 2);
      // Maybe trigger a saccade.
      if (s.regime === "drift" && Math.random() < P_SACCADE_PER_TICK / 10) {
        // /10 because we already gate on regime; this gives ~3 saccades / 10s.
        this.pickSaccade();
      }
      // Maybe leave the screen.
      if (Math.random() < P_OFF_PER_TICK) {
        this.startOffScreenExcursion();
      }
      const offX = s.x < 0 || s.x > this.config.width;
      const offY = s.y < 0 || s.y > this.config.height;
      s.off = offX || offY;
    }

    const sample: GazeSample = {
      x: s.x,
      y: s.y,
      timestamp: Date.now(),
      confidence: s.regime === "off" ? 0.2 : 0.85,
    };
    for (const fn of this.listeners) fn(sample);
  }

  private pickNextRegime(): void {
    const s = this.state;
    if (s.regime === "off") {
      // Return on-screen.
      s.regime = "drift";
      s.regimeMs = 1000 + Math.random() * 2000;
      s.targetX = this.config.width / 2;
      s.targetY = this.config.height / 2;
      s.x = clamp(s.x, 20, this.config.width - 20);
      s.y = clamp(s.y, 20, this.config.height - 20);
      return;
    }
    // 80% drift, 20% saccade-then-drift
    if (Math.random() < 0.8) {
      s.regime = "drift";
      s.regimeMs = 600 + Math.random() * 1500;
    } else {
      this.pickSaccade();
    }
  }

  private pickSaccade(): void {
    const s = this.state;
    const target = this.pickAttractor();
    s.targetX = target.x;
    s.targetY = target.y;
    s.regime = "saccade";
    s.regimeMs = 200 + Math.random() * 250;
  }

  private pickAttractor(): { x: number; y: number } {
    const { attractors, width, height } = this.config;
    if (attractors.length === 0) {
      return { x: width / 2 + rand(-100, 100), y: height / 2 + rand(-60, 60) };
    }
    const r = attractors[Math.floor(Math.random() * attractors.length)];
    return {
      x: r.left + r.width / 2 + rand(-r.width / 4, r.width / 4),
      y: r.top + r.height / 2 + rand(-r.height / 4, r.height / 4),
    };
  }

  private startOffScreenExcursion(): void {
    const s = this.state;
    s.regime = "off";
    // 1–6s off-screen.
    s.regimeMs = 1000 + Math.random() * 5000;
    // Send the gaze in a random direction off the viewport.
    const dir = Math.floor(Math.random() * 4);
    if (dir === 0) {
      s.targetX = -50;
      s.targetY = s.y;
    } else if (dir === 1) {
      s.targetX = this.config.width + 50;
      s.targetY = s.y;
    } else if (dir === 2) {
      s.targetX = s.x;
      s.targetY = -50;
    } else {
      s.targetX = s.x;
      s.targetY = this.config.height + 50;
    }
    s.x = s.targetX;
    s.y = s.targetY;
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
