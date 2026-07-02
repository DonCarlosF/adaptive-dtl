import { describe, it, expect } from "vitest";
import {
  parseServerMessage,
  ServerMessageSchema,
  ClientMessageSchema,
  SnapshotSchema,
  ControlSchema,
  normalizeJoinCode,
  type Snapshot,
} from "./protocol";

const snapshot: Snapshot = {
  phase: "trial",
  domain: "moneyId",
  trialIndex: 4,
  plannedTrials: 10,
  correct: 3,
  numChoices: 2,
  errorlessHighlight: true,
  gaze: { x: 50, y: 60, confidence: 0.9, vw: 800, vh: 600 },
  lastAdaptation: null,
};

describe("protocol — client messages", () => {
  it("accepts snapshot and control variants", () => {
    expect(ClientMessageSchema.safeParse({ type: "snapshot", snapshot }).success).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "control",
        control: { control: "force-break" },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown control and out-of-range numChoices", () => {
    expect(ControlSchema.safeParse({ control: "nope" }).success).toBe(false);
    expect(
      ControlSchema.safeParse({ control: "set-num-choices", numChoices: 1 }).success,
    ).toBe(false);
    expect(
      ControlSchema.safeParse({ control: "set-num-choices", numChoices: 3 }).success,
    ).toBe(true);
  });
});

describe("protocol — server messages", () => {
  it("parses each server frame type", () => {
    expect(parseServerMessage(JSON.stringify({ type: "snapshot", snapshot }))).toEqual({
      type: "snapshot",
      snapshot,
    });
    expect(
      parseServerMessage(
        JSON.stringify({ type: "peer-status", role: "teacher", connected: true }),
      ),
    ).toEqual({ type: "peer-status", role: "teacher", connected: true });
    expect(parseServerMessage(JSON.stringify({ type: "room-opened", code: "ABC123" }))).toEqual({
      type: "room-opened",
      code: "ABC123",
    });
  });

  it("returns null for malformed / non-JSON frames", () => {
    expect(parseServerMessage("}{")).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "snapshot" }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: "mystery" }))).toBeNull();
  });

  it("validates the snapshot shape (phase + gaze nullability)", () => {
    expect(SnapshotSchema.safeParse({ ...snapshot, phase: "trial" }).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...snapshot, gaze: null }).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...snapshot, phase: "warmup" }).success).toBe(false);
    expect(SnapshotSchema.safeParse({ ...snapshot, numChoices: 7 }).success).toBe(false);
  });

  it("rejects the error frame missing fields", () => {
    expect(ServerMessageSchema.safeParse({ type: "error", code: "x" }).success).toBe(false);
    expect(
      ServerMessageSchema.safeParse({ type: "error", code: "x", message: "y" }).success,
    ).toBe(true);
  });
});

describe("normalizeJoinCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeJoinCode(" abc12 ")).toBe("ABC12");
  });
});
