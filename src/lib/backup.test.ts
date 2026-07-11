import { describe, it, expect } from "vitest";
import {
  BACKUP_VERSION,
  backupFilename,
  BackupTables,
  buildBackup,
  countRows,
  parseBackupJson,
  validateBackup,
} from "@/lib/backup";

function tables(overrides: Partial<BackupTables> = {}): BackupTables {
  return {
    students: [{ id: "stu-1", name: "Marcus" }],
    sessions: [
      { id: "sess-1", studentId: "stu-1", domain: "sightWords", trials: [] },
    ],
    settings: [{ id: "app" }],
    aiGenerated: [{ id: "stu-1::sightWords::h", studentId: "stu-1", domain: "sightWords" }],
    mlModels: [{ id: "stu-1::sightWords" }],
    ...overrides,
  } as BackupTables;
}

describe("buildBackup", () => {
  it("stamps the current schema version and an ISO timestamp", () => {
    const now = Date.UTC(2026, 6, 11, 12, 0, 0);
    const b = buildBackup(tables(), now);
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.version).toBe(3);
    expect(b.exportedAt).toBe("2026-07-11T12:00:00.000Z");
    expect(b.tables.students).toHaveLength(1);
  });
});

describe("validateBackup", () => {
  it("accepts a well-formed backup and preserves extra row fields", () => {
    const raw = JSON.parse(
      JSON.stringify(
        buildBackup(
          tables({
            students: [
              { id: "stu-1", name: "Marcus", avatar: "🦊", lowStim: true },
            ] as BackupTables["students"],
          }),
        ),
      ),
    );
    const res = validateBackup(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.tables.students[0]).toMatchObject({
      id: "stu-1",
      avatar: "🦊",
      lowStim: true,
    });
  });

  it("accepts empty tables", () => {
    const res = validateBackup(
      buildBackup(
        tables({
          students: [],
          sessions: [],
          settings: [],
          aiGenerated: [],
          mlModels: [],
        }),
      ),
    );
    expect(res.ok).toBe(true);
  });

  it("rejects non-object roots", () => {
    for (const bad of [null, undefined, 42, "backup", [1, 2, 3]]) {
      const res = validateBackup(bad);
      expect(res.ok).toBe(false);
    }
  });

  it("rejects wrong or missing versions with a version-specific message", () => {
    for (const version of [2, 4, "3", undefined]) {
      const res = validateBackup({ version, exportedAt: "x", tables: {} });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error).toContain(`expects version ${BACKUP_VERSION}`);
    }
  });

  it("rejects a missing table", () => {
    const b = buildBackup(tables()) as unknown as {
      tables: Record<string, unknown>;
    };
    delete b.tables.mlModels;
    const res = validateBackup(b);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("mlModels");
  });

  it("rejects a table that isn't an array", () => {
    const b = buildBackup(tables()) as unknown as {
      tables: Record<string, unknown>;
    };
    b.tables.sessions = { id: "sess-1" };
    expect(validateBackup(b).ok).toBe(false);
  });

  it("rejects rows missing required keys", () => {
    const missingId = buildBackup(
      tables({ students: [{ name: "NoId" }] as never }),
    );
    expect(validateBackup(missingId).ok).toBe(false);

    const missingTrials = buildBackup(
      tables({
        sessions: [{ id: "s", studentId: "stu", domain: "moneyId" }] as never,
      }),
    );
    expect(validateBackup(missingTrials).ok).toBe(false);
  });
});

describe("parseBackupJson", () => {
  it("round-trips a serialized backup", () => {
    const b = buildBackup(tables());
    const res = parseBackupJson(JSON.stringify(b));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(countRows(res.backup.tables)).toEqual({
      students: 1,
      sessions: 1,
      settings: 1,
      aiGenerated: 1,
      mlModels: 1,
    });
  });

  it("rejects text that isn't JSON", () => {
    const res = parseBackupJson("not json at all {");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("JSON");
  });

  it("rejects valid JSON that isn't a backup", () => {
    expect(parseBackupJson('{"hello":"world"}').ok).toBe(false);
    expect(parseBackupJson("[]").ok).toBe(false);
  });
});

describe("backupFilename", () => {
  it("uses the app name and the ISO date", () => {
    const now = Date.UTC(2026, 6, 11, 12, 0, 0);
    expect(backupFilename(now)).toBe("adaptive-dtl-backup_2026-07-11.json");
  });
});
