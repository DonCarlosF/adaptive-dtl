import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Persistence layer.
 *
 * A small JSON-file store with an in-memory mode (no file path → never
 * touches disk, used by the test suite). It's deliberately swappable: the
 * method surface is what a SQLite or Postgres repository would expose, so
 * moving to a real database for a multi-classroom deployment is a
 * drop-in replacement behind this class — no route changes.
 */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

/** A user-scoped record. `data` is the opaque client payload (student / session / AI set). */
export interface Record_ {
  id: string;
  userId: string;
  data: Record<string, unknown>;
  updatedAt: number;
}

/** A single-use password-reset token. Only the SHA-256 hash is stored. */
export interface ResetToken {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

/**
 * The persistence contract the HTTP layer depends on. Implemented by the
 * JSON-file `Store` (default) and by `SqliteStore` (`DATA_BACKEND=sqlite`).
 * Keep the two in lockstep — the shared behavioral suite in
 * `test/stores.test.ts` runs against both.
 */
export interface DataStore {
  // Users
  findUserByEmail(email: string): User | undefined;
  findUserById(id: string): User | undefined;
  createUser(email: string, passwordHash: string): User;
  updateUserPassword(userId: string, passwordHash: string): void;
  // Students
  listStudents(userId: string): Record<string, unknown>[];
  upsertStudent(userId: string, id: string, data: Record<string, unknown>): void;
  removeStudent(userId: string, id: string): void;
  // Sessions
  listSessions(userId: string, studentId: string): Record<string, unknown>[];
  saveSession(userId: string, id: string, data: Record<string, unknown>): void;
  // AI generated sets
  saveAiSet(userId: string, id: string, data: Record<string, unknown>): void;
  getAiSet(userId: string, id: string): Record<string, unknown> | undefined;
  latestAiSet(
    userId: string,
    studentId: string,
    domain: string,
  ): Record<string, unknown> | undefined;
  // Password-reset tokens
  createResetToken(userId: string, tokenHash: string, expiresAt: number): void;
  /**
   * Atomically consume a token: if it exists and has not expired at `now`,
   * delete it and return the owning userId; otherwise return undefined.
   * A token can therefore be redeemed at most once.
   */
  consumeResetToken(tokenHash: string, now: number): string | undefined;
}

interface DBShape {
  users: User[];
  students: Record_[];
  sessions: Record_[];
  aiSets: Record_[];
  resetTokens: ResetToken[];
}

function emptyDb(): DBShape {
  return { users: [], students: [], sessions: [], aiSets: [], resetTokens: [] };
}

export class Store implements DataStore {
  private db: DBShape = emptyDb();

  constructor(private readonly file?: string) {
    this.load();
  }

  private load(): void {
    if (this.file && existsSync(this.file)) {
      try {
        this.db = { ...emptyDb(), ...JSON.parse(readFileSync(this.file, "utf8")) };
      } catch {
        this.db = emptyDb();
      }
    }
  }

  private persist(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.db), "utf8");
  }

  // --- Users -------------------------------------------------------------

  findUserByEmail(email: string): User | undefined {
    const lower = email.toLowerCase();
    return this.db.users.find((u) => u.email === lower);
  }

  findUserById(id: string): User | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  createUser(email: string, passwordHash: string): User {
    const user: User = {
      id: cryptoRandomId(),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: Date.now(),
    };
    this.db.users.push(user);
    this.persist();
    return user;
  }

  updateUserPassword(userId: string, passwordHash: string): void {
    const user = this.db.users.find((u) => u.id === userId);
    if (!user) return;
    user.passwordHash = passwordHash;
    this.persist();
  }

  // --- Students ----------------------------------------------------------

  listStudents(userId: string): Record<string, unknown>[] {
    return this.db.students
      .filter((r) => r.userId === userId)
      .map((r) => r.data);
  }

  upsertStudent(userId: string, id: string, data: Record<string, unknown>): void {
    upsert(this.db.students, userId, id, data);
    this.persist();
  }

  removeStudent(userId: string, id: string): void {
    this.db.students = this.db.students.filter(
      (r) => !(r.userId === userId && r.id === id),
    );
    // Cascade: drop the student's sessions and AI sets too.
    this.db.sessions = this.db.sessions.filter(
      (r) => !(r.userId === userId && (r.data.studentId as string) === id),
    );
    this.db.aiSets = this.db.aiSets.filter(
      (r) => !(r.userId === userId && (r.data.studentId as string) === id),
    );
    this.persist();
  }

  // --- Sessions ----------------------------------------------------------

  listSessions(userId: string, studentId: string): Record<string, unknown>[] {
    return this.db.sessions
      .filter((r) => r.userId === userId && r.data.studentId === studentId)
      .map((r) => r.data);
  }

  saveSession(userId: string, id: string, data: Record<string, unknown>): void {
    upsert(this.db.sessions, userId, id, data);
    this.persist();
  }

  // --- AI generated sets -------------------------------------------------

  saveAiSet(userId: string, id: string, data: Record<string, unknown>): void {
    upsert(this.db.aiSets, userId, id, data);
    this.persist();
  }

  getAiSet(userId: string, id: string): Record<string, unknown> | undefined {
    return this.db.aiSets.find((r) => r.userId === userId && r.id === id)?.data;
  }

  latestAiSet(
    userId: string,
    studentId: string,
    domain: string,
  ): Record<string, unknown> | undefined {
    const matches = this.db.aiSets
      .filter(
        (r) =>
          r.userId === userId &&
          r.data.studentId === studentId &&
          r.data.domain === domain,
      )
      .map((r) => r.data)
      .sort(
        (a, b) => (b.generatedAt as number) - (a.generatedAt as number),
      );
    return matches[0];
  }

  // --- Password-reset tokens ----------------------------------------------

  createResetToken(userId: string, tokenHash: string, expiresAt: number): void {
    this.db.resetTokens.push({ tokenHash, userId, expiresAt });
    this.persist();
  }

  consumeResetToken(tokenHash: string, now: number): string | undefined {
    // Lazily drop everything that has expired, then redeem-and-delete.
    this.db.resetTokens = this.db.resetTokens.filter((t) => t.expiresAt > now);
    const match = this.db.resetTokens.find((t) => t.tokenHash === tokenHash);
    if (match) {
      this.db.resetTokens = this.db.resetTokens.filter((t) => t !== match);
    }
    this.persist();
    return match?.userId;
  }
}

function upsert(
  coll: Record_[],
  userId: string,
  id: string,
  data: Record<string, unknown>,
): void {
  const existing = coll.find((r) => r.userId === userId && r.id === id);
  if (existing) {
    existing.data = data;
    existing.updatedAt = Date.now();
  } else {
    coll.push({ id, userId, data, updatedAt: Date.now() });
  }
}

export function cryptoRandomId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
