/**
 * Shared progress-report summary.
 *
 * Both the CSV and PDF exports (csvExport.ts, pdfExport.ts) shape a
 * student's session history the same way: a context header, one row per
 * in-window session, and totals. That shaping lives here so the two
 * formats can never drift apart.
 *
 * Defaults to "last quarter" (90 days) — the typical IEP reporting cadence.
 */
import {
  AdaptationKind,
  DOMAIN_LABELS,
  SessionRecord,
  StudentProfile,
} from "@/engine/types";

const ADAPTATION_LABELS: Record<AdaptationKind, string> = {
  "increase-choices": "increased choices",
  "decrease-choices": "decreased choices",
  "enable-errorless": "errorless prompt",
  "suggest-break": "break",
  "early-end": "ended early",
};

/** Default reporting window: one quarter. */
export const QUARTER_DAYS = 90;

export function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Summarize a session's adaptation events as a readable count string. */
function summarizeAdaptations(session: SessionRecord): string {
  if (session.adaptations.length === 0) return "";
  const counts = new Map<AdaptationKind, number>();
  for (const a of session.adaptations) {
    counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, n]) => {
      const label = ADAPTATION_LABELS[kind] ?? kind;
      return n > 1 ? `${label} x${n}` : label;
    })
    .join("; ");
}

export interface ProgressRow {
  date: string;
  domain: string;
  trials: number;
  correct: number;
  accuracyPct: number;
  adaptationCount: number;
  adaptationDetail: string;
  endedEarly: boolean;
  aiGenerated: boolean;
}

export interface ProgressSummary {
  context: {
    name: string;
    grade: string;
    readingLevel: string;
    windowDays: number;
    endDate: string;
  };
  rows: ProgressRow[];
  totals: {
    sessions: number;
    trials: number;
    correct: number;
    accuracyPct: number;
    adaptations: number;
  };
}

/**
 * Build the structured progress summary for a student over the trailing
 * `windowDays`. Rows are sorted oldest-first to read like a log.
 */
export function summarizeProgress(
  student: StudentProfile,
  sessions: SessionRecord[],
  windowDays = QUARTER_DAYS,
  now = Date.now(),
): ProgressSummary {
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = sessions
    .filter((s) => s.startedAt >= cutoff)
    .sort((a, b) => a.startedAt - b.startedAt);

  let totalTrials = 0;
  let totalCorrect = 0;
  let totalAdaptations = 0;

  const rows: ProgressRow[] = inWindow.map((s) => {
    const correct = s.trials.filter((t) => t.correct).length;
    totalTrials += s.trials.length;
    totalCorrect += correct;
    totalAdaptations += s.adaptations.length;
    return {
      date: isoDate(s.startedAt),
      domain: DOMAIN_LABELS[s.domain],
      trials: s.trials.length,
      correct,
      accuracyPct: Math.round(s.accuracy * 100),
      adaptationCount: s.adaptations.length,
      adaptationDetail: summarizeAdaptations(s),
      endedEarly: s.endedEarly,
      aiGenerated: s.aiGenerated === true,
    };
  });

  return {
    context: {
      name: student.name,
      grade: student.grade,
      readingLevel: student.readingLevel,
      windowDays,
      endDate: isoDate(now),
    },
    rows,
    totals: {
      sessions: inWindow.length,
      trials: totalTrials,
      correct: totalCorrect,
      accuracyPct:
        totalTrials > 0 ? Math.round((totalCorrect / totalTrials) * 100) : 0,
      adaptations: totalAdaptations,
    },
  };
}

/** A filesystem-safe base name, e.g. `Ana-Garc-a_progress_2026-06-05`. */
export function progressFileBase(
  student: StudentProfile,
  now = Date.now(),
): string {
  const safeName = student.name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return `${safeName}_progress_${isoDate(now)}`;
}
