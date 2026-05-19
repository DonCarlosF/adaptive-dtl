/**
 * Design tokens.
 *
 * Calm palette by intent: warm canvas, deep ink, sage as the only "go"
 * color, coral reserved for warnings (not errors). No saturated reds, no
 * gradients, no flashing. Animation timings are slow on purpose — fast
 * movement is dysregulating for many of our students.
 */

export const colors = {
  canvas: "#FAF7F2",
  ink: "#1F2937",
  muted: "#6B7280",
  line: "#E6E1D8",
  sage: "#7BA098",
  sageDeep: "#5C8479",
  sageSoft: "#DDE9E5",
  coral: "#E8927C",
  coralSoft: "#F5C5B8",
} as const;

export const timing = {
  reinforcerMs: 2000,
  chimeMs: 400,
  longPressMs: 3000,
  promptDelayMs: 350,
} as const;

export const tile = {
  minSizePx: 120,
  gapPx: 24,
} as const;
