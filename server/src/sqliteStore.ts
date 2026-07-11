import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { cryptoRandomId, type DataStore, type User } from "./store.js";

/**
 * SQLite persistence (opt-in via `DATA_BACKEND=sqlite`).
 *
 * Same public surface as the JSON `Store` — both implement `DataStore`, and
 * the shared behavioral suite in `test/stores.test.ts` keeps them in
 * lockstep. Client payloads stay opaque in a JSON `data` column; the columns
 * the queries filter or sort on (user_id, student_id, domain, generated_at)
 * are extracted at write time and indexed.
 *
 * No file path → an in-memory database (used by tests, mirrors `new Store()`).
 * File-backed databases run in WAL mode; every statement is prepared once.
 */

type Row = { data: string };

export class SqliteStore implements DataStore {
  private readonly db: Database.Database;
  private readonly stmt: ReturnType<SqliteStore["prepareStatements"]>;
  private readonly cascadeRemoveStudent: (userId: string, id: string) => void;

  constructor(file?: string) {
    if (file) mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file ?? ":memory:");
    if (file) this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.stmt = this.prepareStatements();
    this.cascadeRemoveStudent = this.db.transaction(
      (userId: string, id: string) => {
        this.stmt.deleteStudent.run(userId, id);
        this.stmt.deleteSessionsOfStudent.run(userId, id);
        this.stmt.deleteAiSetsOfStudent.run(userId, id);
      },
    );
  }

  /** Release the underlying database handle (file-backed tests). */
  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        user_id    TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        user_id    TEXT NOT NULL,
        id         TEXT NOT NULL,
        student_id TEXT,
        data       TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_student
        ON sessions (user_id, student_id);

      CREATE TABLE IF NOT EXISTS ai_sets (
        user_id      TEXT NOT NULL,
        id           TEXT NOT NULL,
        student_id   TEXT,
        domain       TEXT,
        generated_at INTEGER,
        data         TEXT NOT NULL,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_sets_latest
        ON ai_sets (user_id, student_id, domain, generated_at);

      CREATE TABLE IF NOT EXISTS reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
  }

  private prepareStatements() {
    const p = (sql: string) => this.db.prepare(sql);
    return {
      // users
      userByEmail: p("SELECT * FROM users WHERE email = ?"),
      userById: p("SELECT * FROM users WHERE id = ?"),
      insertUser: p(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      ),
      updatePassword: p("UPDATE users SET password_hash = ? WHERE id = ?"),
      // students
      listStudents: p(
        "SELECT data FROM students WHERE user_id = ? ORDER BY updated_at",
      ),
      upsertStudent: p(`
        INSERT INTO students (user_id, id, data, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `),
      deleteStudent: p("DELETE FROM students WHERE user_id = ? AND id = ?"),
      deleteSessionsOfStudent: p(
        "DELETE FROM sessions WHERE user_id = ? AND student_id = ?",
      ),
      deleteAiSetsOfStudent: p(
        "DELETE FROM ai_sets WHERE user_id = ? AND student_id = ?",
      ),
      // sessions
      listSessions: p(
        "SELECT data FROM sessions WHERE user_id = ? AND student_id = ? ORDER BY updated_at",
      ),
      upsertSession: p(`
        INSERT INTO sessions (user_id, id, student_id, data, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, id) DO UPDATE SET
          student_id = excluded.student_id, data = excluded.data, updated_at = excluded.updated_at
      `),
      // ai sets
      upsertAiSet: p(`
        INSERT INTO ai_sets (user_id, id, student_id, domain, generated_at, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, id) DO UPDATE SET
          student_id = excluded.student_id, domain = excluded.domain,
          generated_at = excluded.generated_at, data = excluded.data, updated_at = excluded.updated_at
      `),
      getAiSet: p("SELECT data FROM ai_sets WHERE user_id = ? AND id = ?"),
      latestAiSet: p(`
        SELECT data FROM ai_sets
        WHERE user_id = ? AND student_id = ? AND domain = ?
        ORDER BY generated_at DESC LIMIT 1
      `),
      // reset tokens
      insertResetToken: p(
        "INSERT OR REPLACE INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      ),
      getResetToken: p(
        "SELECT user_id FROM reset_tokens WHERE token_hash = ? AND expires_at > ?",
      ),
      deleteResetToken: p("DELETE FROM reset_tokens WHERE token_hash = ?"),
      pruneResetTokens: p("DELETE FROM reset_tokens WHERE expires_at <= ?"),
    };
  }

  // --- Users -------------------------------------------------------------

  findUserByEmail(email: string): User | undefined {
    return toUser(this.stmt.userByEmail.get(email.toLowerCase()));
  }

  findUserById(id: string): User | undefined {
    return toUser(this.stmt.userById.get(id));
  }

  createUser(email: string, passwordHash: string): User {
    const user: User = {
      id: cryptoRandomId(),
      email: email.toLowerCase(),
      passwordHash,
      createdAt: Date.now(),
    };
    this.stmt.insertUser.run(user.id, user.email, user.passwordHash, user.createdAt);
    return user;
  }

  updateUserPassword(userId: string, passwordHash: string): void {
    this.stmt.updatePassword.run(passwordHash, userId);
  }

  // --- Students ----------------------------------------------------------

  listStudents(userId: string): Record<string, unknown>[] {
    return (this.stmt.listStudents.all(userId) as Row[]).map(parseData);
  }

  upsertStudent(userId: string, id: string, data: Record<string, unknown>): void {
    this.stmt.upsertStudent.run(userId, id, JSON.stringify(data), Date.now());
  }

  removeStudent(userId: string, id: string): void {
    this.cascadeRemoveStudent(userId, id);
  }

  // --- Sessions ----------------------------------------------------------

  listSessions(userId: string, studentId: string): Record<string, unknown>[] {
    return (this.stmt.listSessions.all(userId, studentId) as Row[]).map(parseData);
  }

  saveSession(userId: string, id: string, data: Record<string, unknown>): void {
    this.stmt.upsertSession.run(
      userId,
      id,
      asIndexedString(data.studentId),
      JSON.stringify(data),
      Date.now(),
    );
  }

  // --- AI generated sets -------------------------------------------------

  saveAiSet(userId: string, id: string, data: Record<string, unknown>): void {
    this.stmt.upsertAiSet.run(
      userId,
      id,
      asIndexedString(data.studentId),
      asIndexedString(data.domain),
      typeof data.generatedAt === "number" ? data.generatedAt : null,
      JSON.stringify(data),
      Date.now(),
    );
  }

  getAiSet(userId: string, id: string): Record<string, unknown> | undefined {
    const row = this.stmt.getAiSet.get(userId, id) as Row | undefined;
    return row ? parseData(row) : undefined;
  }

  latestAiSet(
    userId: string,
    studentId: string,
    domain: string,
  ): Record<string, unknown> | undefined {
    const row = this.stmt.latestAiSet.get(userId, studentId, domain) as
      | Row
      | undefined;
    return row ? parseData(row) : undefined;
  }

  // --- Password-reset tokens ----------------------------------------------

  createResetToken(userId: string, tokenHash: string, expiresAt: number): void {
    this.stmt.insertResetToken.run(tokenHash, userId, expiresAt);
  }

  consumeResetToken(tokenHash: string, now: number): string | undefined {
    this.stmt.pruneResetTokens.run(now);
    const row = this.stmt.getResetToken.get(tokenHash, now) as
      | { user_id: string }
      | undefined;
    if (!row) return undefined;
    this.stmt.deleteResetToken.run(tokenHash);
    return row.user_id;
  }
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

function toUser(row: unknown): User | undefined {
  if (!row) return undefined;
  const r = row as UserRow;
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
  };
}

function parseData(row: Row): Record<string, unknown> {
  return JSON.parse(row.data) as Record<string, unknown>;
}

/** Extract an indexable string column from the opaque payload (null if absent). */
function asIndexedString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
