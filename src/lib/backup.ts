/**
 * Backup / restore for the local-first Dexie database.
 *
 * The app's whole world lives in this browser's IndexedDB — a cleared
 * profile or a swapped device loses a term of session data. `exportBackup`
 * writes every table into one versioned JSON download; `importBackup`
 * validates the shape and replaces local data inside a single Dexie
 * transaction (all-or-nothing — a bad file never half-imports).
 *
 * Validation is deliberately shape-level (ids, table arrays, version), not
 * a full re-validation of every field: the rows were produced by this same
 * app, and being lenient about optional fields keeps old backups importable.
 * The pure layer (`parseBackupJson` / `validateBackup` / `buildBackup`) is
 * unit-tested; the Dexie/download IO stays thin.
 */

import { z } from "zod";
import { db } from "@/db/schema";
import type { AppSettings } from "@/db/schema";
import type { MLModelRecord } from "@/db/mlModelRepo";
import type {
  AIGeneratedSet,
  SessionRecord,
  StudentProfile,
} from "@/engine/types";

/** Tracks the Dexie schema version in `src/db/schema.ts` (v3). */
export const BACKUP_VERSION = 3;

// ---------------------------------------------------------------------------
// Shape schemas — one minimal object per table (extra fields pass through).
// ---------------------------------------------------------------------------

const studentRow = z.object({ id: z.string(), name: z.string() }).passthrough();
const sessionRow = z
  .object({
    id: z.string(),
    studentId: z.string(),
    domain: z.string(),
    trials: z.array(z.unknown()),
  })
  .passthrough();
const settingsRow = z.object({ id: z.string() }).passthrough();
const aiGeneratedRow = z
  .object({ id: z.string(), studentId: z.string(), domain: z.string() })
  .passthrough();
const mlModelRow = z.object({ id: z.string() }).passthrough();

const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.object({
    students: z.array(studentRow),
    sessions: z.array(sessionRow),
    settings: z.array(settingsRow),
    aiGenerated: z.array(aiGeneratedRow),
    mlModels: z.array(mlModelRow),
  }),
});

export type BackupFile = z.infer<typeof backupSchema>;
export type BackupTables = BackupFile["tables"];

export interface BackupCounts {
  students: number;
  sessions: number;
  settings: number;
  aiGenerated: number;
  mlModels: number;
}

export type ValidateResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string };

export type ImportResult =
  | { ok: true; counts: BackupCounts }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Pure layer
// ---------------------------------------------------------------------------

/** Assemble a backup object from raw table arrays. Pure — no IO. */
export function buildBackup(
  tables: BackupTables,
  now: number = Date.now(),
): BackupFile {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    tables,
  };
}

/** Validate an already-parsed JSON value as a backup file. Pure — no IO. */
export function validateBackup(data: unknown): ValidateResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Not a backup file — expected a JSON object." };
  }
  const version = (data as { version?: unknown }).version;
  if (version !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version ${JSON.stringify(
        version ?? null,
      )} — this app expects version ${BACKUP_VERSION}.`,
    };
  }
  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Backup file is malformed — ${detail}` };
  }
  return { ok: true, backup: parsed.data };
}

/** Parse raw JSON text into a validated backup. Pure — no IO. */
export function parseBackupJson(text: string): ValidateResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  return validateBackup(data);
}

export function countRows(tables: BackupTables): BackupCounts {
  return {
    students: tables.students.length,
    sessions: tables.sessions.length,
    settings: tables.settings.length,
    aiGenerated: tables.aiGenerated.length,
    mlModels: tables.mlModels.length,
  };
}

/** e.g. `adaptive-dtl-backup_2026-07-11.json` */
export function backupFilename(now: number = Date.now()): string {
  return `adaptive-dtl-backup_${new Date(now).toISOString().slice(0, 10)}.json`;
}

// ---------------------------------------------------------------------------
// IO layer (thin)
// ---------------------------------------------------------------------------

/** Read every table and trigger a JSON download (mirrors `downloadCsv`). */
export async function exportBackup(): Promise<BackupCounts> {
  const [students, sessions, settings, aiGenerated, mlModels] =
    await db.transaction(
      "r",
      [db.students, db.sessions, db.settings, db.aiGenerated, db.mlModels],
      () =>
        Promise.all([
          db.students.toArray(),
          db.sessions.toArray(),
          db.settings.toArray(),
          db.aiGenerated.toArray(),
          db.mlModels.toArray(),
        ]),
    );

  // Runtime rows always satisfy the shape schemas; the cast just bridges
  // the app types to the lenient backup types.
  const tables = {
    students,
    sessions,
    settings,
    aiGenerated,
    mlModels,
  } as unknown as BackupTables;

  const backup = buildBackup(tables);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return countRows(tables);
}

/**
 * Validate `file` and REPLACE all local data with its contents.
 * Clear + bulkPut run inside one Dexie transaction, so a failure rolls
 * back and the previous data survives intact.
 */
export async function importBackup(file: File): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Could not read that file." };
  }

  const validated = parseBackupJson(text);
  if (!validated.ok) return validated;
  const { tables } = validated.backup;

  try {
    await db.transaction(
      "rw",
      [db.students, db.sessions, db.settings, db.aiGenerated, db.mlModels],
      async () => {
        await Promise.all([
          db.students.clear(),
          db.sessions.clear(),
          db.settings.clear(),
          db.aiGenerated.clear(),
          db.mlModels.clear(),
        ]);
        // Shape-validated rows → app row types (see module comment).
        await db.students.bulkPut(tables.students as unknown as StudentProfile[]);
        await db.sessions.bulkPut(tables.sessions as unknown as SessionRecord[]);
        await db.settings.bulkPut(tables.settings as unknown as AppSettings[]);
        await db.aiGenerated.bulkPut(
          tables.aiGenerated as unknown as AIGeneratedSet[],
        );
        await db.mlModels.bulkPut(tables.mlModels as unknown as MLModelRecord[]);
      },
    );
  } catch (e) {
    return {
      ok: false,
      error: `Import failed — nothing was changed. (${(e as Error).message})`,
    };
  }

  return { ok: true, counts: countRows(tables) };
}
