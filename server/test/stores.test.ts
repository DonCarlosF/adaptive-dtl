import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { Store, type DataStore } from "../src/store.js";
import { SqliteStore } from "../src/sqliteStore.js";

/**
 * Behavioral parity suite: every assertion here runs against BOTH the JSON
 * `Store` and `SqliteStore`. If you add a store method, add its behavior
 * here once and both backends must satisfy it.
 */

const backends: Array<[string, () => DataStore]> = [
  ["Store (JSON, in-memory)", () => new Store()],
  ["SqliteStore (in-memory)", () => new SqliteStore()],
];

describe.each(backends)("%s", (_name, makeStore) => {
  let store: DataStore;
  beforeEach(() => {
    store = makeStore();
  });

  describe("users", () => {
    it("creates a user and finds it by email (case-insensitive) and id", () => {
      const created = store.createUser("Teacher@Example.com", "hash-1");
      expect(created.email).toBe("teacher@example.com");
      expect(store.findUserByEmail("TEACHER@example.COM")?.id).toBe(created.id);
      expect(store.findUserById(created.id)?.passwordHash).toBe("hash-1");
    });

    it("returns undefined for unknown users", () => {
      expect(store.findUserByEmail("nobody@example.com")).toBeUndefined();
      expect(store.findUserById("nope")).toBeUndefined();
    });

    it("updates a user's password hash", () => {
      const user = store.createUser("t@example.com", "old-hash");
      store.updateUserPassword(user.id, "new-hash");
      expect(store.findUserById(user.id)?.passwordHash).toBe("new-hash");
      // Updating a nonexistent user is a silent no-op.
      store.updateUserPassword("ghost", "x");
    });
  });

  describe("students", () => {
    it("upserts, lists, and scopes students per user", () => {
      store.upsertStudent("u1", "s1", { id: "s1", name: "Ana" });
      store.upsertStudent("u1", "s2", { id: "s2", name: "Ben" });
      store.upsertStudent("u2", "s1", { id: "s1", name: "Cara" });

      const u1 = store.listStudents("u1");
      expect(u1).toHaveLength(2);
      expect(u1.map((s) => s.name).sort()).toEqual(["Ana", "Ben"]);
      expect(store.listStudents("u2")).toHaveLength(1);
      expect(store.listStudents("u3")).toHaveLength(0);
    });

    it("overwrites (not duplicates) on repeated upsert of the same id", () => {
      store.upsertStudent("u1", "s1", { id: "s1", name: "Ana" });
      store.upsertStudent("u1", "s1", { id: "s1", name: "Ana Maria" });
      const list = store.listStudents("u1");
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("Ana Maria");
    });

    it("removes a student and cascades to their sessions and AI sets only", () => {
      store.upsertStudent("u1", "s1", { id: "s1" });
      store.upsertStudent("u1", "s2", { id: "s2" });
      store.saveSession("u1", "sess1", { id: "sess1", studentId: "s1" });
      store.saveSession("u1", "sess2", { id: "sess2", studentId: "s2" });
      store.saveAiSet("u1", "set1", { id: "set1", studentId: "s1", domain: "matching" });
      store.saveAiSet("u1", "set2", { id: "set2", studentId: "s2", domain: "matching" });
      // Same ids under another user must survive u1's cascade.
      store.upsertStudent("u2", "s1", { id: "s1" });
      store.saveSession("u2", "sess1", { id: "sess1", studentId: "s1" });

      store.removeStudent("u1", "s1");

      expect(store.listStudents("u1").map((s) => s.id)).toEqual(["s2"]);
      expect(store.listSessions("u1", "s1")).toHaveLength(0);
      expect(store.getAiSet("u1", "set1")).toBeUndefined();
      // Untouched: the sibling student and the other user.
      expect(store.listSessions("u1", "s2")).toHaveLength(1);
      expect(store.getAiSet("u1", "set2")).toBeDefined();
      expect(store.listStudents("u2")).toHaveLength(1);
      expect(store.listSessions("u2", "s1")).toHaveLength(1);
    });
  });

  describe("sessions", () => {
    it("saves and lists sessions filtered by student", () => {
      store.saveSession("u1", "a", { id: "a", studentId: "s1", accuracy: 0.8 });
      store.saveSession("u1", "b", { id: "b", studentId: "s2" });
      const list = store.listSessions("u1", "s1");
      expect(list).toHaveLength(1);
      expect(list[0].accuracy).toBe(0.8);
      expect(store.listSessions("u2", "s1")).toHaveLength(0);
    });

    it("upserts sessions by id", () => {
      store.saveSession("u1", "a", { id: "a", studentId: "s1", accuracy: 0.5 });
      store.saveSession("u1", "a", { id: "a", studentId: "s1", accuracy: 0.9 });
      const list = store.listSessions("u1", "s1");
      expect(list).toHaveLength(1);
      expect(list[0].accuracy).toBe(0.9);
    });
  });

  describe("AI sets", () => {
    it("saves and fetches a set by id, scoped per user", () => {
      store.saveAiSet("u1", "set1", { id: "set1", studentId: "s1", domain: "matching" });
      expect(store.getAiSet("u1", "set1")?.domain).toBe("matching");
      expect(store.getAiSet("u2", "set1")).toBeUndefined();
      expect(store.getAiSet("u1", "missing")).toBeUndefined();
    });

    it("returns the latest set by generatedAt for a student+domain", () => {
      store.saveAiSet("u1", "old", {
        id: "old", studentId: "s1", domain: "matching", generatedAt: 1000,
      });
      store.saveAiSet("u1", "new", {
        id: "new", studentId: "s1", domain: "matching", generatedAt: 2000,
      });
      store.saveAiSet("u1", "otherDomain", {
        id: "otherDomain", studentId: "s1", domain: "sorting", generatedAt: 9000,
      });
      store.saveAiSet("u1", "otherStudent", {
        id: "otherStudent", studentId: "s2", domain: "matching", generatedAt: 9000,
      });

      expect(store.latestAiSet("u1", "s1", "matching")?.id).toBe("new");
      expect(store.latestAiSet("u1", "s1", "sorting")?.id).toBe("otherDomain");
      expect(store.latestAiSet("u1", "s1", "counting")).toBeUndefined();
      expect(store.latestAiSet("u2", "s1", "matching")).toBeUndefined();
    });
  });

  describe("reset tokens", () => {
    it("consumes a valid token exactly once", () => {
      store.createResetToken("u1", "hash-abc", 10_000);
      expect(store.consumeResetToken("hash-abc", 5_000)).toBe("u1");
      // Single-use: the same token never redeems twice.
      expect(store.consumeResetToken("hash-abc", 5_000)).toBeUndefined();
    });

    it("rejects an expired token", () => {
      store.createResetToken("u1", "hash-old", 10_000);
      expect(store.consumeResetToken("hash-old", 10_000)).toBeUndefined();
      expect(store.consumeResetToken("hash-old", 99_999)).toBeUndefined();
    });

    it("rejects an unknown token and keeps others intact", () => {
      store.createResetToken("u1", "hash-real", 10_000);
      expect(store.consumeResetToken("hash-fake", 5_000)).toBeUndefined();
      expect(store.consumeResetToken("hash-real", 5_000)).toBe("u1");
    });
  });
});

// --- durability: both backends must survive a close/reopen cycle ---------

describe("file-backed durability", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adtl-store-"));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it("JSON Store reloads its data from disk", () => {
    const file = join(dir, "db.json");
    const first = new Store(file);
    const user = first.createUser("persist@example.com", "hash");
    first.upsertStudent(user.id, "s1", { id: "s1", name: "Ana" });

    const reopened = new Store(file);
    expect(reopened.findUserByEmail("persist@example.com")?.id).toBe(user.id);
    expect(reopened.listStudents(user.id)).toHaveLength(1);
  });

  it("SqliteStore reloads its data from disk", () => {
    const file = join(dir, "app.db");
    const first = new SqliteStore(file);
    const user = first.createUser("persist@example.com", "hash");
    first.upsertStudent(user.id, "s1", { id: "s1", name: "Ana" });
    first.saveAiSet(user.id, "set1", {
      id: "set1", studentId: "s1", domain: "matching", generatedAt: 42,
    });
    first.close();

    const reopened = new SqliteStore(file);
    expect(reopened.findUserByEmail("persist@example.com")?.id).toBe(user.id);
    expect(reopened.listStudents(user.id)).toHaveLength(1);
    expect(reopened.latestAiSet(user.id, "s1", "matching")?.generatedAt).toBe(42);
    reopened.close();
  });
});
