/**
 * Persistence for the per-(student, domain) difficulty model.
 *
 * Mirrors the shape of the other repos (`sessionRepo`, `aiGeneratedRepo`):
 * a thin async wrapper over the Dexie table with a couple of typed
 * convenience methods. The model TRAINS ACROSS SESSIONS — the session
 * loop loads it on start, `update`s it per trial, and `save`s it on
 * session end — so this repo is the durable home for that learning.
 *
 * We store the model as a serialized string (via the difficulty model's
 * own serializer) rather than as a structured object, so the DB row is
 * decoupled from the in-memory model shape and survives additive changes.
 */

import { DomainId } from "@/engine/types";
import {
  DifficultyModel,
  deserializeModel,
  initModel,
  serializeModel,
} from "@/ml/difficultyModel";
import { db } from "@/db/schema";

/** A persisted ML model row. `id` is `${studentId}::${domain}`. */
export interface MLModelRecord {
  /** Composite primary key: `${studentId}::${domain}`. */
  id: string;
  studentId: string;
  domain: DomainId;
  /** Serialized model weights + metadata. */
  serialized: string;
  /** Number of SGD updates applied across all sessions. */
  trainedExamples: number;
  updatedAt: number;
}

export function mlModelKey(studentId: string, domain: DomainId): string {
  return `${studentId}::${domain}`;
}

export const mlModelRepo = {
  /**
   * Load the model for a (student, domain). Returns a fresh `initModel()`
   * when none is stored yet, so callers never have to branch on "first
   * session" — the cold-start prior IS a usable model.
   */
  async getModel(
    studentId: string,
    domain: DomainId,
  ): Promise<DifficultyModel> {
    const row = await db.mlModels.get(mlModelKey(studentId, domain));
    if (!row) return initModel();
    return deserializeModel(row.serialized);
  },

  /** Raw row fetch, mainly for diagnostics / dashboards. */
  async getRecord(
    studentId: string,
    domain: DomainId,
  ): Promise<MLModelRecord | undefined> {
    return db.mlModels.get(mlModelKey(studentId, domain));
  },

  /** Persist the model for a (student, domain), upserting the row. */
  async saveModel(
    studentId: string,
    domain: DomainId,
    model: DifficultyModel,
  ): Promise<void> {
    const record: MLModelRecord = {
      id: mlModelKey(studentId, domain),
      studentId,
      domain,
      serialized: serializeModel(model),
      trainedExamples: model.trainedExamples,
      updatedAt: Date.now(),
    };
    await db.mlModels.put(record);
  },
};
