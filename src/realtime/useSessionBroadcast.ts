/**
 * useSessionBroadcast — the single integration point for the StudentSession
 * page. Call it once with the current session view-model; it:
 *
 *   1. Opens a co-presence room (student role) and exposes the join code.
 *   2. Broadcasts a compact, PII-free snapshot whenever the session changes.
 *   3. Invokes `onControl` when a watching teacher sends a command.
 *
 * Everything no-ops when the cloud backend isn't configured, so importing and
 * calling this hook is safe in pure-offline mode.
 */

import { useEffect, useRef, useState } from "react";
import type { Control, ServerMessage, Snapshot } from "./protocol";
import { useSessionChannel } from "./useSessionChannel";

export interface BroadcastInput {
  /** Whether the session is active and should be broadcast. */
  enabled: boolean;
  /** The snapshot to broadcast. Pass null while nothing is ready yet. */
  snapshot: Snapshot | null;
}

export interface BroadcastResult {
  /** Join code to show the teacher, or null until the room opens. */
  joinCode: string | null;
  /** Whether a teacher is currently watching. */
  teacherWatching: boolean;
  connected: boolean;
}

export function useSessionBroadcast(
  input: BroadcastInput,
  onControl: (control: Control) => void,
): BroadcastResult {
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [teacherWatching, setTeacherWatching] = useState(false);
  const onControlRef = useRef(onControl);
  onControlRef.current = onControl;

  const handleMessage = useRef((msg: ServerMessage) => {
    switch (msg.type) {
      case "room-opened":
        setJoinCode(msg.code);
        break;
      case "peer-status":
        if (msg.role === "teacher") setTeacherWatching(msg.connected);
        break;
      case "control":
        onControlRef.current(msg.control);
        break;
      default:
        break;
    }
  }).current;

  const { status, send } = useSessionChannel(
    { role: "student", enabled: input.enabled },
    handleMessage,
  );

  // Reset presence/code when the channel drops so stale UI doesn't linger.
  useEffect(() => {
    if (status !== "open") {
      setTeacherWatching(false);
      if (status === "disabled") setJoinCode(null);
    }
  }, [status]);

  // Broadcast on every snapshot change. JSON-diff guard avoids spamming the
  // relay with identical frames (e.g. unrelated re-renders).
  const lastSentRef = useRef<string | null>(null);
  const snapshot = input.snapshot;
  useEffect(() => {
    if (status !== "open" || !snapshot) return;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSentRef.current) return;
    lastSentRef.current = serialized;
    send({ type: "snapshot", snapshot });
  }, [status, snapshot, send]);

  return {
    joinCode,
    teacherWatching,
    connected: status === "open",
  };
}
