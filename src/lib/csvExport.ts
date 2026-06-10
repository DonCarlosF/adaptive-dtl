/**
 * IEP progress export.
 *
 * Builds a CSV summary of a student's sessions — one row per session, plus a
 * trailing summary row — formatted to drop into an IEP progress-report.
 * Defaults to "last quarter" (90 days) since that is the typical IEP reporting
 * cadence. No external dependencies: the CSV is assembled and downloaded via a
 * Blob so it works fully offline.
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

/** Quote a single CSV field, escaping per RFC 4180. */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",");
}

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Summarize the adaptation events of a session as a readable count string. */
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

/**
 * Build the IEP progress CSV for a student over the trailing `windowDays`.
 * Returns the CSV text. Rows are sorted oldest-first to read like a log.
 */
export function buildProgressCsv(
  student: StudentProfile,
  sessions: SessionRecord[],
  windowDays = QUARTER_DAYS,
  now = Date.now(),
): string {
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = sessions
    .filter((s) => s.startedAt >= cutoff)
    .sort((a, b) => a.startedAt - b.startedAt);

  const lines: string[] = [];

  // Context header — the identifying rows a teacher wants at the top of an
  // IEP progress report before the per-session data.
  lines.push(csvRow(["Student", student.name]));
  lines.push(csvRow(["Grade", student.grade]));
  lines.push(csvRow(["Reading level", student.readingLevel]));
  lines.push(
    csvRow(["Reporting window", `${windowDays} days ending ${isoDate(now)}`]),
  );
  lines.push(csvRow([])); // blank separator

  lines.push(
    csvRow([
      "Date",
      "Domain",
      "Trials",
      "Correct",
      "Accuracy %",
      "Adaptations",
      "Adaptation detail",
      "Ended early",
      "AI generated",
    ]),
  );

  let totalTrials = 0;
  let totalCorrect = 0;
  for (const s of inWindow) {
    const correct = s.trials.filter((t) => t.correct).length;
    totalTrials += s.trials.length;
    totalCorrect += correct;
    lines.push(
      csvRow([
        isoDate(s.startedAt),
        DOMAIN_LABELS[s.domain],
        s.trials.length,
        correct,
        Math.round(s.accuracy * 100),
        s.adaptations.length,
        summarizeAdaptations(s),
        s.endedEarly ? "yes" : "no",
        s.aiGenerated ? "yes" : "no",
      ]),
    );
  }

  // Trailing summary row: the single line a teacher copies into an IEP report.
  const overallAccuracy =
    totalTrials > 0 ? Math.round((totalCorrect / totalTrials) * 100) : 0;
  lines.push(csvRow([])); // blank separator
  lines.push(
    csvRow([
      "TOTAL",
      `${inWindow.length} sessions`,
      totalTrials,
      totalCorrect,
      overallAccuracy,
      inWindow.reduce((n, s) => n + s.adaptations.length, 0),
      "",
      "",
      "",
    ]),
  );

  return lines.join("\r\n");
}

/** A filesystem-safe filename for the export, e.g. `Ana-G_progress_2026-06-05.csv`. */
export function progressCsvFilename(
  student: StudentProfile,
  now = Date.now(),
): string {
  const safeName = student.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${safeName}_progress_${isoDate(now)}.csv`;
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a UTF-8 BOM so Excel opens accented student names correctly.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
