/**
 * Pure reducer that folds inbound realtime messages into the state the
 * TeacherMonitor renders. Kept separate from the React hook so it can be
 * unit-tested without sockets or a DOM.
 */

import type { ServerMessage, Snapshot } from "./protocol";

export interface MonitorState {
  /** Latest student snapshot, or null before the first frame arrives. */
  snapshot: Snapshot | null;
  /** Whether the student device is currently connected. */
  studentConnected: boolean;
  /** Last error surfaced by the server (e.g. bad code), or null. */
  error: string | null;
  /** Derived: accuracy 0..1 over completed trials (0 when none). */
  accuracy: number;
}

export const initialMonitorState: MonitorState = {
  snapshot: null,
  studentConnected: false,
  error: null,
  accuracy: 0,
};

function accuracyOf(s: Snapshot): number {
  return s.trialIndex > 0 ? s.correct / s.trialIndex : 0;
}

/** Fold one inbound server message into the monitor state. */
export function reduceMonitor(state: MonitorState, msg: ServerMessage): MonitorState {
  switch (msg.type) {
    case "snapshot":
      return {
        ...state,
        snapshot: msg.snapshot,
        accuracy: accuracyOf(msg.snapshot),
        // A fresh snapshot means the student is alive.
        studentConnected: true,
        error: null,
      };
    case "peer-status":
      if (msg.role === "student") {
        return { ...state, studentConnected: msg.connected };
      }
      return state; // teacher presence isn't shown on the teacher's own view
    case "error":
      return { ...state, error: msg.message };
    case "room-opened":
    case "control":
      // Not meaningful on the teacher monitor; ignore.
      return state;
    default: {
      // Exhaustiveness guard — fails to compile if a message type is added.
      void (msg satisfies never);
      return state;
    }
  }
}
