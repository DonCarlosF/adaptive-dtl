/**
 * Per-item mastery analytics.
 *
 * Sessions record trials against template ids (`sw-w-the`, `mn-m-quarter-7`,
 * `tt-t-3-00-2`, …). This module maps those back to the underlying item and
 * folds every attempt a student has ever made into one per-item summary —
 * the data behind the mastery heatmap on the student detail page.
 *
 * Everything here is pure. The templateId → itemId inference is the shared
 * home for all five domain prefixes; `activityGenerator.ts` keeps a private
 * copy of the same regex (its lane is AI-context building) — if a prefix is
 * ever added, update both.
 */

import { SessionRecord } from "@/engine/types";

export type MasteryBucket = "new" | "emerging" | "developing" | "mastered";

export interface ItemMastery {
  itemId: string;
  attempts: number;
  correct: number;
  /** 0..1 — 0 when there are no attempts. */
  accuracy: number;
  /** Epoch ms of the most recent attempt. */
  lastSeen: number;
  bucket: MasteryBucket;
}

/**
 * Map a hand-authored templateId back to its item id.
 *
 *   sw-w-the        → w-the       (sight words)
 *   mn-m-quarter-7  → m-quarter   (money — trailing trial index stripped)
 *   sg-s-stop-3     → s-stop      (community signs)
 *   tt-t-3-00-2     → t-3-00      (time telling)
 *   em-e-happy-9    → e-happy     (emotions)
 *
 * Returns null for anything else (seeded fake data, `ai-…` generated sets).
 */
export function inferItemIdFromTemplateId(templateId: string): string | null {
  const m = templateId.match(/^(sw|mn|sg|tt|em)-(.+?)(?:-\d+)?$/);
  return m ? m[2] : null;
}

/**
 * Bucket thresholds:
 *   new        — fewer than 3 attempts (not enough signal yet)
 *   mastered   — ≥90% accurate over at least 5 attempts
 *   developing — ≥60% accurate
 *   emerging   — below 60%
 */
export function masteryBucket(
  attempts: number,
  accuracy: number,
): MasteryBucket {
  if (attempts < 3) return "new";
  if (accuracy >= 0.9 && attempts >= 5) return "mastered";
  if (accuracy >= 0.6) return "developing";
  return "emerging";
}

/**
 * Fold all trials across `sessions` into per-item mastery summaries,
 * keyed by item id. Trials whose templateId can't be attributed to an
 * item (seeded/AI ids) are skipped.
 */
export function computeItemMastery(
  sessions: SessionRecord[],
): Record<string, ItemMastery> {
  const acc: Record<
    string,
    { attempts: number; correct: number; lastSeen: number }
  > = {};

  for (const session of sessions) {
    for (const trial of session.trials) {
      const itemId = inferItemIdFromTemplateId(trial.templateId);
      if (!itemId) continue;
      const entry = (acc[itemId] ??= { attempts: 0, correct: 0, lastSeen: 0 });
      entry.attempts += 1;
      if (trial.correct) entry.correct += 1;
      if (trial.timestamp > entry.lastSeen) entry.lastSeen = trial.timestamp;
    }
  }

  const out: Record<string, ItemMastery> = {};
  for (const [itemId, e] of Object.entries(acc)) {
    const accuracy = e.attempts === 0 ? 0 : e.correct / e.attempts;
    out[itemId] = {
      itemId,
      attempts: e.attempts,
      correct: e.correct,
      accuracy,
      lastSeen: e.lastSeen,
      bucket: masteryBucket(e.attempts, accuracy),
    };
  }
  return out;
}
