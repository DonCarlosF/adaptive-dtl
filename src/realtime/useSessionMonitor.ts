/**
 * useSessionMonitor — teacher-side counterpart to useSessionBroadcast.
 * Joins a room by code, folds inbound messages through `reduceMonitor`, and
 * exposes a typed `sendControl` for the steering buttons.
 */

import { useCallback, useReducer } from "react";
import type { Control, ServerMessage } from "./protocol";
import {
  initialMonitorState,
  reduceMonitor,
  type MonitorState,
} from "./monitorState";
import { useSessionChannel, type ChannelStatus } from "./useSessionChannel";

export interface MonitorResult {
  state: MonitorState;
  status: ChannelStatus;
  sendControl: (control: Control) => void;
}

export function useSessionMonitor(code: string | null): MonitorResult {
  const [state, dispatch] = useReducer(reduceMonitor, initialMonitorState);

  const onMessage = useCallback((msg: ServerMessage) => dispatch(msg), []);

  const { status, send } = useSessionChannel(
    { role: "teacher", enabled: !!code, code },
    onMessage,
  );

  const sendControl = useCallback(
    (control: Control) => send({ type: "control", control }),
    [send],
  );

  return { state, status, sendControl };
}
