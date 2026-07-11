/**
 * Real-time co-presence relay — protocol + room manager.
 *
 * A *student session* opens a room (keyed by a short join code). A *teacher*
 * joins that room by code from another device and watches a live mirror of
 * the session, optionally steering it with control messages.
 *
 * Design goals:
 *  - The message protocol is a zod schema (wire validation, privacy-first:
 *    no PII flows over the wire — only ids and aggregate counters).
 *  - The `RoomManager` is pure and testable: it operates over a minimal
 *    `Socket` interface, so unit tests use fakes and never touch real WS.
 *  - Rooms are scoped to the owning user id. A teacher may only join rooms
 *    owned by the same user (this app's "teacher" and "student device" are
 *    the same account on two devices). Cross-user joins are rejected.
 *
 * The socket transport (ws) lives in index.ts; this file knows nothing
 * about it beyond the `Socket` shape below.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------

/** Role a connection plays in a room. */
export const RoleSchema = z.enum(["student", "teacher"]);
export type Role = z.infer<typeof RoleSchema>;

/** Compact, PII-free snapshot the student broadcasts to watching teachers. */
export const SnapshotSchema = z.object({
  /** One of the StudentSession phases. */
  phase: z.enum(["loading", "trial", "feedback", "break", "done"]),
  /** Domain being practiced. Keep in sync with DomainId in the app
   * (src/engine/types.ts) and the client mirror (src/realtime/protocol.ts). */
  domain: z.enum([
    "sightWords",
    "moneyId",
    "communitySigns",
    "timeTelling",
    "emotions",
  ]),
  /** Completed trial count and the planned total (for the progress ring). */
  trialIndex: z.number().int().nonnegative(),
  plannedTrials: z.number().int().positive(),
  /** Correct answers so far (0..trialIndex). */
  correct: z.number().int().nonnegative(),
  /** Current number of choices on screen (2..4). */
  numChoices: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  errorlessHighlight: z.boolean(),
  /** Latest gaze sample in viewport pixels, or null when eye tracking is off. */
  gaze: z
    .object({
      x: z.number(),
      y: z.number(),
      confidence: z.number(),
      /** Viewport size so the teacher can scale the dot to its own screen. */
      vw: z.number().positive(),
      vh: z.number().positive(),
    })
    .nullable(),
  /** Most recent adaptation (kind + plain-English reason), or null. */
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

/** Control commands a teacher sends down to the student device. */
export const ControlSchema = z.discriminatedUnion("control", [
  z.object({ control: z.literal("force-break") }),
  z.object({
    control: z.literal("set-num-choices"),
    numChoices: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({ control: z.literal("end-session") }),
]);
export type Control = z.infer<typeof ControlSchema>;

/**
 * Every message on the wire. `type` discriminates direction/intent:
 *  - student→server: `snapshot`
 *  - teacher→server: `control`
 *  - server→peer:    `snapshot` (forwarded), `control` (forwarded),
 *                    `peer-status` (presence), `error`
 */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), snapshot: SnapshotSchema }),
  z.object({ type: z.literal("control"), control: ControlSchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), snapshot: SnapshotSchema }),
  z.object({ type: z.literal("control"), control: ControlSchema }),
  /** Presence: tells one peer whether the other side is connected. */
  z.object({
    type: z.literal("peer-status"),
    role: RoleSchema,
    connected: z.boolean(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Parse a raw inbound frame into a typed ClientMessage, or null if invalid. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const res = ClientMessageSchema.safeParse(data);
  return res.success ? res.data : null;
}

// ---------------------------------------------------------------------------
// Join codes
// ---------------------------------------------------------------------------

// Unambiguous alphabet — no 0/O/1/I/L to avoid teacher mistyping.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

export function generateJoinCode(rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Room manager (pure, transport-agnostic)
// ---------------------------------------------------------------------------

/**
 * Minimal socket surface the manager needs. Real code passes a thin adapter
 * over a `ws` WebSocket; tests pass fakes that record sent frames.
 */
export interface Socket {
  /** Send a server message (already typed; adapter serializes). */
  send(message: ServerMessage): void;
  /** Close the connection (optionally with a reason for logging). */
  close(reason?: string): void;
}

interface Room {
  code: string;
  /** Owner user id — both student and teacher must match this. */
  userId: string;
  student: Socket | null;
  teacher: Socket | null;
  /** Last snapshot, replayed to a teacher on join so the mirror isn't blank. */
  lastSnapshot: Snapshot | null;
  createdAt: number;
}

export type JoinResult =
  | { ok: true; code: string }
  | { ok: false; code: "no-room" | "cross-user" | "occupied"; message: string };

/**
 * Manages the set of live rooms. One instance per server process.
 * Not concurrency-sensitive: Node is single-threaded and ws callbacks are
 * serialized on the event loop.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private codeFor = new Map<Socket, string>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly rng: () => number = Math.random,
  ) {}

  /** Number of active rooms — for tests/observability. */
  get size(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(normalizeJoinCode(code));
  }

  /**
   * A student opens a room. Generates a unique code and registers the socket
   * as the student side. Returns the code to show the teacher.
   */
  openRoom(userId: string, socket: Socket): string {
    let code = generateJoinCode(this.rng);
    // Avoid collisions (vanishingly rare, but cheap to guard).
    while (this.rooms.has(code)) code = generateJoinCode(this.rng);
    const room: Room = {
      code,
      userId,
      student: socket,
      teacher: null,
      lastSnapshot: null,
      createdAt: this.now(),
    };
    this.rooms.set(code, room);
    this.codeFor.set(socket, code);
    return code;
  }

  /**
   * A teacher joins an existing room by code. Enforces user scoping and a
   * single teacher per room. On success, replays the last snapshot and
   * notifies both peers of presence.
   */
  joinRoom(userId: string, rawCode: string, socket: Socket): JoinResult {
    const code = normalizeJoinCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: "no-room", message: "No session with that code." };
    }
    if (room.userId !== userId) {
      // Privacy: never confirm existence of another user's room beyond a
      // generic rejection.
      return {
        ok: false,
        code: "cross-user",
        message: "That session belongs to a different account.",
      };
    }
    if (room.teacher) {
      return {
        ok: false,
        code: "occupied",
        message: "Another monitor is already watching this session.",
      };
    }
    room.teacher = socket;
    this.codeFor.set(socket, code);

    // Replay last snapshot so the monitor renders immediately.
    if (room.lastSnapshot) {
      socket.send({ type: "snapshot", snapshot: room.lastSnapshot });
    }
    // Presence both directions.
    socket.send({ type: "peer-status", role: "student", connected: !!room.student });
    room.student?.send({ type: "peer-status", role: "teacher", connected: true });
    return { ok: true, code };
  }

  /**
   * Route an inbound client message from `socket` to its peer.
   * - student `snapshot` → teacher (and cached for replay)
   * - teacher `control`  → student
   * Mismatched direction (e.g. a student sending control) is ignored.
   */
  route(socket: Socket, message: ClientMessage): void {
    const code = this.codeFor.get(socket);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;

    if (message.type === "snapshot") {
      if (socket !== room.student) return; // only the student broadcasts
      room.lastSnapshot = message.snapshot;
      room.teacher?.send({ type: "snapshot", snapshot: message.snapshot });
    } else if (message.type === "control") {
      if (socket !== room.teacher) return; // only the teacher steers
      room.student?.send({ type: "control", control: message.control });
    }
  }

  /**
   * Handle a disconnect. If the student leaves, the room is torn down (and
   * any teacher notified + closed). If the teacher leaves, the room stays
   * open so a teacher can rejoin; the student is notified of absence.
   */
  disconnect(socket: Socket): void {
    const code = this.codeFor.get(socket);
    this.codeFor.delete(socket);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;

    if (socket === room.student) {
      room.student = null;
      if (room.teacher) {
        room.teacher.send({ type: "peer-status", role: "student", connected: false });
      }
      this.rooms.delete(code);
    } else if (socket === room.teacher) {
      room.teacher = null;
      room.student?.send({ type: "peer-status", role: "teacher", connected: false });
    }
  }
}
