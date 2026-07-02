/**
 * Real-time co-presence wire protocol (client copy).
 *
 * This is a deliberate, standalone duplicate of the schema in the server's
 * `server/src/realtime.ts`. The two must stay in sync; both are small and
 * zod-validated so a drift surfaces immediately as a parse failure rather
 * than a silent type mismatch.
 *
 * Privacy-first: nothing here carries student PII — only ids, counters, and
 * a transient gaze coordinate.
 */

import { z } from "zod";

export const RoleSchema = z.enum(["student", "teacher"]);
export type Role = z.infer<typeof RoleSchema>;

/** Compact snapshot the student broadcasts to a watching teacher. */
export const SnapshotSchema = z.object({
  phase: z.enum(["loading", "trial", "feedback", "break", "done"]),
  domain: z.enum(["sightWords", "moneyId", "communitySigns"]),
  trialIndex: z.number().int().nonnegative(),
  plannedTrials: z.number().int().positive(),
  correct: z.number().int().nonnegative(),
  numChoices: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  errorlessHighlight: z.boolean(),
  gaze: z
    .object({
      x: z.number(),
      y: z.number(),
      confidence: z.number(),
      vw: z.number().positive(),
      vh: z.number().positive(),
    })
    .nullable(),
  lastAdaptation: z
    .object({
      kind: z.enum([
        "increase-choices",
        "decrease-choices",
        "enable-errorless",
        "suggest-break",
        "early-end",
      ]),
      reason: z.string().max(280),
      timestamp: z.number(),
    })
    .nullable(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const ControlSchema = z.discriminatedUnion("control", [
  z.object({ control: z.literal("force-break") }),
  z.object({
    control: z.literal("set-num-choices"),
    numChoices: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({ control: z.literal("end-session") }),
]);
export type Control = z.infer<typeof ControlSchema>;

/** Messages the client *sends*. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), snapshot: SnapshotSchema }),
  z.object({ type: z.literal("control"), control: ControlSchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Messages the client *receives* (forwarded peer frames + presence/errors). */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), snapshot: SnapshotSchema }),
  z.object({ type: z.literal("control"), control: ControlSchema }),
  z.object({
    type: z.literal("peer-status"),
    role: RoleSchema,
    connected: z.boolean(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  /** Sent by the server to a student right after its room is created. */
  z.object({ type: z.literal("room-opened"), code: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Parse a raw inbound frame into a typed ServerMessage, or null if invalid. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const res = ServerMessageSchema.safeParse(data);
  return res.success ? res.data : null;
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}
