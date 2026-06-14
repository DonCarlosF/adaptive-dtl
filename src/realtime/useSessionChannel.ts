/**
 * useSessionChannel — a typed WebSocket channel for co-presence.
 *
 * Connects to the backend's `/ws/session` relay as either a `student`
 * (opens a room, receives a join code) or a `teacher` (joins a room by
 * code). Provides a typed `send` and a `parsed` message callback, plus
 * simple-but-robust reconnect with capped exponential backoff.
 *
 * No-ops gracefully when the cloud backend isn't configured
 * (`!isCloudEnabled()`), so the rest of the app behaves exactly as before in
 * offline mode.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, wsBaseUrl } from "@/api/client";
import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "./protocol";

export type ChannelStatus = "disabled" | "connecting" | "open" | "closed";

interface StudentParams {
  role: "student";
  /** Whether the channel should be live (e.g. only during an active session). */
  enabled: boolean;
}

interface TeacherParams {
  role: "teacher";
  enabled: boolean;
  /** Join code to watch; channel stays idle until set. */
  code: string | null;
}

export type ChannelParams = StudentParams | TeacherParams;

export interface SessionChannel {
  status: ChannelStatus;
  /** Send a typed client message. No-op when the socket isn't open. */
  send: (message: ClientMessage) => void;
}

const MAX_BACKOFF_MS = 10_000;
const BASE_BACKOFF_MS = 500;

export function useSessionChannel(
  params: ChannelParams,
  onMessage: (msg: ServerMessage) => void,
): SessionChannel {
  const [status, setStatus] = useState<ChannelStatus>("disabled");
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const closedByUsRef = useRef(false);
  // Keep the latest onMessage without forcing reconnects when it changes.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const base = wsBaseUrl();
  const token = getToken();
  const code = params.role === "teacher" ? params.code : null;
  // A teacher needs a code before connecting; a student just needs to be enabled.
  const wantConnection =
    params.enabled && !!base && !!token && (params.role === "student" || !!code);

  const buildUrl = useCallback((): string | null => {
    if (!base || !token) return null;
    const url = new URL("/ws/session", base);
    url.searchParams.set("token", token);
    url.searchParams.set("role", params.role);
    if (params.role === "teacher" && code) url.searchParams.set("code", code);
    return url.toString();
  }, [base, token, params.role, code]);

  useEffect(() => {
    if (!wantConnection) {
      setStatus(base && token ? "closed" : "disabled");
      return;
    }

    closedByUsRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const url = buildUrl();
      if (!url) return;
      setStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        const msg = parseServerMessage(
          typeof ev.data === "string" ? ev.data : "",
        );
        if (msg) onMessageRef.current(msg);
      };
      ws.onclose = () => {
        wsRef.current = null;
        setStatus("closed");
        if (closedByUsRef.current) return;
        // Capped exponential backoff with jitter.
        const attempt = retriesRef.current++;
        const delay = Math.min(
          MAX_BACKOFF_MS,
          BASE_BACKOFF_MS * 2 ** attempt,
        );
        const jitter = delay * 0.25 * Math.random();
        reconnectTimer = setTimeout(connect, delay + jitter);
      };
      ws.onerror = () => {
        // Let onclose drive reconnection; closing here avoids a dangling socket.
        ws.close();
      };
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // Reconnect when connection intent or target URL changes.
  }, [wantConnection, buildUrl, base, token]);

  const send = useCallback((message: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  return { status, send };
}
