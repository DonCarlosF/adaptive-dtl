import { describe, it, expect } from "vitest";
import {
  initialMonitorState,
  reduceMonitor,
  type MonitorState,
} from "./monitorState";
import type { ServerMessage, Snapshot } from "./protocol";

const snapshot: Snapshot = {
  phase: "trial",
  domain: "sightWords",
  trialIndex: 4,
  plannedTrials: 10,
  correct: 3,
  numChoices: 3,
  errorlessHighlight: false,
  gaze: null,
  lastAdaptation: null,
};

function fold(msgs: ServerMessage[], start: MonitorState = initialMonitorState) {
  return msgs.reduce(reduceMonitor, start);
}

describe("reduceMonitor", () => {
  it("stores a snapshot, derives accuracy, and marks the student connected", () => {
    const next = reduceMonitor(initialMonitorState, { type: "snapshot", snapshot });
    expect(next.snapshot).toEqual(snapshot);
    expect(next.accuracy).toBeCloseTo(3 / 4);
    expect(next.studentConnected).toBe(true);
    expect(next.error).toBeNull();
  });

  it("reports zero accuracy before any trials complete", () => {
    const next = reduceMonitor(initialMonitorState, {
      type: "snapshot",
      snapshot: { ...snapshot, trialIndex: 0, correct: 0 },
    });
    expect(next.accuracy).toBe(0);
  });

  it("tracks student presence via peer-status", () => {
    const connected = reduceMonitor(initialMonitorState, {
      type: "peer-status",
      role: "student",
      connected: true,
    });
    expect(connected.studentConnected).toBe(true);
    const gone = reduceMonitor(connected, {
      type: "peer-status",
      role: "student",
      connected: false,
    });
    expect(gone.studentConnected).toBe(false);
  });

  it("ignores the teacher's own presence frames", () => {
    const next = reduceMonitor(initialMonitorState, {
      type: "peer-status",
      role: "teacher",
      connected: true,
    });
    expect(next).toEqual(initialMonitorState);
  });

  it("surfaces server errors and clears them on the next snapshot", () => {
    const withError = reduceMonitor(initialMonitorState, {
      type: "error",
      code: "no-room",
      message: "No session with that code.",
    });
    expect(withError.error).toBe("No session with that code.");
    const recovered = reduceMonitor(withError, { type: "snapshot", snapshot });
    expect(recovered.error).toBeNull();
  });

  it("folds a realistic message sequence", () => {
    const final = fold([
      { type: "peer-status", role: "student", connected: true },
      { type: "snapshot", snapshot },
      { type: "snapshot", snapshot: { ...snapshot, trialIndex: 5, correct: 4 } },
      { type: "peer-status", role: "student", connected: false },
    ]);
    expect(final.snapshot?.trialIndex).toBe(5);
    expect(final.accuracy).toBeCloseTo(4 / 5);
    expect(final.studentConnected).toBe(false);
  });

  it("ignores control / room-opened frames on the teacher view", () => {
    const base = reduceMonitor(initialMonitorState, { type: "snapshot", snapshot });
    expect(reduceMonitor(base, { type: "control", control: { control: "force-break" } })).toEqual(
      base,
    );
    expect(reduceMonitor(base, { type: "room-opened", code: "ZZZ999" })).toEqual(base);
  });
});
