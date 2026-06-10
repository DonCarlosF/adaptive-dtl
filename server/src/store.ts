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

interface DBShape {
  users: User[];
  students: Record_[];
  sessions: Record_[];
  aiSets: Record_[];
}

function emptyDb(): DBShape {
  return { users: [], students: [], sessions: [], aiSets: [] };
}

export class Store {
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

function cryptoRandomId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
