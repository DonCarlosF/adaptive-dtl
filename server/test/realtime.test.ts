import { describe, it, expect, beforeEach } from "vitest";
import {
  RoomManager,
  parseClientMessage,
  ClientMessageSchema,
  SnapshotSchema,
  ControlSchema,
  generateJoinCode,
  normalizeJoinCode,
  type ServerMessage,
  type Snapshot,
  type Socket,
} from "../src/realtime.js";

/** Fake socket that records every frame the manager sends to it. */
class FakeSocket implements Socket {
  sent: ServerMessage[] = [];
  closed = false;
  closeReason?: string;
  send(message: ServerMessage): void {
    this.sent.push(message);
  }
  close(reason?: string): void {
    this.closed = true;
    this.closeReason = reason;
  }
  /** Convenience: last frame of a given type. */
  last<T extends ServerMessage["type"]>(type: T) {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
}

const snapshot: Snapshot = {
  phase: "trial",
  domain: "sightWords",
  trialIndex: 2,
  plannedTrials: 10,
  correct: 2,
  numChoices: 3,
  errorlessHighlight: false,
  gaze: { x: 100, y: 200, confidence: 0.8, vw: 1024, vh: 768 },
  lastAdaptation: null,
};

describe("join codes", () => {
  it("generates codes of fixed length from the unambiguous alphabet", () => {
    const code = generateJoinCode(() => 0.5);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("normalizes whitespace and case", () => {
    expect(normalizeJoinCode("  abc123 ")).toBe("ABC123");
  });
});

describe("RoomManager", () => {
  let manager: RoomManager;
  beforeEach(() => {
    // Deterministic rng so generated codes are predictable in tests.
    let i = 0;
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05];
    manager = new RoomManager(
      () => 1000,
      () => seq[i++ % seq.length],
    );
  });

  it("opens a room for a student and returns a code", () => {
    const student = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    expect(code).toHaveLength(6);
    expect(manager.size).toBe(1);
    expect(manager.getRoom(code)?.userId).toBe("user-1");
  });

  it("lets a same-user teacher join and announces presence both ways", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);

    const result = manager.joinRoom("user-1", code, teacher);
    expect(result.ok).toBe(true);

    // Teacher learns the student is connected.
    expect(teacher.last("peer-status")).toEqual({
      type: "peer-status",
      role: "student",
      connected: true,
    });
    // Student learns a teacher arrived.
    expect(student.last("peer-status")).toEqual({
      type: "peer-status",
      role: "teacher",
      connected: true,
    });
  });

  it("replays the last snapshot to a teacher on join", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    manager.route(student, { type: "snapshot", snapshot });

    manager.joinRoom("user-1", code, teacher);
    expect(teacher.last("snapshot")).toEqual({ type: "snapshot", snapshot });
  });

  it("rejects a cross-user join without leaking room contents", () => {
    const student = new FakeSocket();
    const intruder = new FakeSocket();
    const code = manager.openRoom("user-1", student);

    const result = manager.joinRoom("user-2", code, intruder);
    expect(result).toMatchObject({ ok: false, code: "cross-user" });
    // Intruder never became the teacher; student got no presence update.
    expect(manager.getRoom(code)?.teacher).toBeNull();
    expect(student.sent.find((m) => m.type === "peer-status")).toBeUndefined();
  });

  it("rejects joining a non-existent room", () => {
    const teacher = new FakeSocket();
    const result = manager.joinRoom("user-1", "ZZZZZZ", teacher);
    expect(result).toMatchObject({ ok: false, code: "no-room" });
  });

  it("rejects a second teacher (room occupied)", () => {
    const student = new FakeSocket();
    const t1 = new FakeSocket();
    const t2 = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    expect(manager.joinRoom("user-1", code, t1).ok).toBe(true);
    expect(manager.joinRoom("user-1", code, t2)).toMatchObject({
      ok: false,
      code: "occupied",
    });
  });

  it("routes student snapshots to the teacher and caches them", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    manager.joinRoom("user-1", code, teacher);

    manager.route(student, { type: "snapshot", snapshot });
    expect(teacher.last("snapshot")).toEqual({ type: "snapshot", snapshot });
    expect(manager.getRoom(code)?.lastSnapshot).toEqual(snapshot);
  });

  it("routes teacher control messages to the student", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    manager.joinRoom("user-1", code, teacher);

    manager.route(teacher, { type: "control", control: { control: "force-break" } });
    expect(student.last("control")).toEqual({
      type: "control",
      control: { control: "force-break" },
    });

    manager.route(teacher, {
      type: "control",
      control: { control: "set-num-choices", numChoices: 2 },
    });
    expect(student.last("control")).toEqual({
      type: "control",
      control: { control: "set-num-choices", numChoices: 2 },
    });
  });

  it("ignores misdirected messages (student sending control, teacher sending snapshot)", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    manager.joinRoom("user-1", code, teacher);
    const teacherBefore = teacher.sent.length;
    const studentBefore = student.sent.length;

    // Student tries to send control — must be ignored.
    manager.route(student, { type: "control", control: { control: "end-session" } });
    // Teacher tries to send a snapshot — must be ignored.
    manager.route(teacher, { type: "snapshot", snapshot });

    expect(teacher.sent.length).toBe(teacherBefore);
    expect(student.sent.length).toBe(studentBefore);
  });

  it("tears down the room when the student disconnects and notifies the teacher", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    manager.joinRoom("user-1", code, teacher);

    manager.disconnect(student);
    expect(manager.size).toBe(0);
    expect(teacher.last("peer-status")).toEqual({
      type: "peer-status",
      role: "student",
      connected: false,
    });
  });

  it("keeps the room open when the teacher disconnects, notifies the student, and allows rejoin", () => {
    const student = new FakeSocket();
    const teacher = new FakeSocket();
    const code = manager.openRoom("user-1", student);
    manager.joinRoom("user-1", code, teacher);

    manager.disconnect(teacher);
    expect(manager.size).toBe(1);
    expect(student.last("peer-status")).toEqual({
      type: "peer-status",
      role: "teacher",
      connected: false,
    });

    const teacher2 = new FakeSocket();
    expect(manager.joinRoom("user-1", code, teacher2).ok).toBe(true);
  });
});

describe("protocol validation", () => {
  it("accepts a well-formed snapshot message", () => {
    const msg = { type: "snapshot", snapshot };
    expect(parseClientMessage(JSON.stringify(msg))).toEqual(msg);
  });

  it("accepts each control variant", () => {
    expect(ControlSchema.safeParse({ control: "force-break" }).success).toBe(true);
    expect(
      ControlSchema.safeParse({ control: "set-num-choices", numChoices: 4 }).success,
    ).toBe(true);
    expect(ControlSchema.safeParse({ control: "end-session" }).success).toBe(true);
  });

  it("rejects an out-of-range numChoices", () => {
    expect(
      ControlSchema.safeParse({ control: "set-num-choices", numChoices: 5 }).success,
    ).toBe(false);
  });

  it("rejects unknown phases and malformed snapshots", () => {
    expect(SnapshotSchema.safeParse({ ...snapshot, phase: "paused" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: "bogus" }).success).toBe(false);
  });

  it("returns null for non-JSON and structurally invalid frames", () => {
    expect(parseClientMessage("not json{{")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "control" }))).toBeNull();
  });

  it("allows a null gaze (eye tracking off) and a populated lastAdaptation", () => {
    const s: Snapshot = {
      ...snapshot,
      gaze: null,
      lastAdaptation: {
        kind: "decrease-choices",
        reason: "Two misses in a row — simplifying.",
        timestamp: 123,
      },
    };
    expect(SnapshotSchema.safeParse(s).success).toBe(true);
  });
});
