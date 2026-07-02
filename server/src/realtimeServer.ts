/**
 * WebSocket transport for the co-presence relay. This is the only file that
 * knows about `ws`; it adapts real sockets onto the pure `RoomManager` in
 * `realtime.ts`.
 *
 * Connection URL: `/ws/session?token=<jwt>&role=student`
 *                 `/ws/session?token=<jwt>&role=teacher&code=ABC123`
 *
 * - `token` authenticates the user (same JWT as the REST API).
 * - `role=student` opens a new room; the server replies with a `room-opened`
 *   frame carrying the join code.
 * - `role=teacher` joins an existing room by `code`; user-scoped.
 */

import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./auth.js";
import {
  parseClientMessage,
  RoomManager,
  type ServerMessage,
  type Socket,
} from "./realtime.js";

export interface RealtimeOptions {
  jwtSecret: string;
  /** Pathname the WS server listens on. */
  path: string;
}

/** Frame the server sends a student right after it opens their room. */
interface RoomOpenedFrame {
  type: "room-opened";
  code: string;
}

/** Wrap a ws socket in the minimal `Socket` interface the manager needs. */
function adapt(ws: WebSocket): Socket {
  return {
    send(message: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    close(reason?: string) {
      // 1000 = normal closure. Reason is truncated by the protocol; keep short.
      ws.close(1000, reason?.slice(0, 120));
    },
  };
}

export function attachRealtime(
  server: HttpServer,
  options: RealtimeOptions,
): { manager: RoomManager; wss: WebSocketServer } {
  const manager = new RoomManager();
  // We handle the upgrade manually so we can reject unauthenticated/foreign
  // paths cleanly instead of letting ws accept everything.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== options.path) {
      // Not ours — leave it for any other upgrade handler, else drop.
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token") ?? "";
    const payload = token ? verifyToken(token, options.jwtSecret) : null;
    if (!payload) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, url, payload.sub, manager);
    });
  });

  return { manager, wss };
}

function handleConnection(
  ws: WebSocket,
  url: URL,
  userId: string,
  manager: RoomManager,
): void {
  const adapter = adapt(ws);
  const role = url.searchParams.get("role");

  if (role === "student") {
    const code = manager.openRoom(userId, adapter);
    const frame: RoomOpenedFrame = { type: "room-opened", code };
    ws.send(JSON.stringify(frame));
  } else if (role === "teacher") {
    const result = manager.joinRoom(userId, url.searchParams.get("code") ?? "", adapter);
    if (!result.ok) {
      adapter.send({ type: "error", code: result.code, message: result.message });
      adapter.close(result.code);
      return;
    }
  } else {
    adapter.send({ type: "error", code: "bad-role", message: "Unknown role." });
    adapter.close("bad-role");
    return;
  }

  ws.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) {
      adapter.send({ type: "error", code: "bad-message", message: "Invalid frame." });
      return;
    }
    manager.route(adapter, message);
  });

  ws.on("close", () => manager.disconnect(adapter));
  ws.on("error", () => manager.disconnect(adapter));
}
