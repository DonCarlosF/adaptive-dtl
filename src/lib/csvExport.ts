/**
 * IEP progress export — CSV.
 *
 * One row per session plus a trailing TOTAL row, with a context header,
 * formatted to drop into an IEP progress report. Built from the shared
 * summary in progressReport.ts. No external dependencies: assembled and
 * downloaded via a Blob so it works fully offline.
 */
import { StudentProfile } from "@/engine/types";
import {
  isoDate,
  progressFileBase,
  QUARTER_DAYS,
  summarizeProgress,
} from "./progressReport";

export { QUARTER_DAYS } from "./progressReport";

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

/**
 * Build the IEP progress CSV for a student over the trailing `windowDays`.
 * Rows are oldest-first to read like a log.
 */
export function buildProgressCsv(
  student: StudentProfile,
  sessions: Parameters<typeof summarizeProgress>[1],
  windowDays = QUARTER_DAYS,
  now = Date.now(),
): string {
  const { context, rows, totals } = summarizeProgress(
    student,
    sessions,
    windowDays,
    now,
  );

  const lines: string[] = [];

  // Context header — the identifying rows a teacher wants at the top of an
  // IEP progress report before the per-session data.
  lines.push(csvRow(["Student", context.name]));
  lines.push(csvRow(["Grade", context.grade]));
  lines.push(csvRow(["Reading level", context.readingLevel]));
  lines.push(
    csvRow([
      "Reporting window",
      `${context.windowDays} days ending ${context.endDate}`,
    ]),
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

  for (const r of rows) {
    lines.push(
      csvRow([
        r.date,
        r.domain,
        r.trials,
        r.correct,
        r.accuracyPct,
        r.adaptationCount,
        r.adaptationDetail,
        r.endedEarly ? "yes" : "no",
        r.aiGenerated ? "yes" : "no",
      ]),
    );
  }

  // Trailing summary row: the single line a teacher copies into an IEP report.
  lines.push(csvRow([])); // blank separator
  lines.push(
    csvRow([
      "TOTAL",
      `${totals.sessions} sessions`,
      totals.trials,
      totals.correct,
      totals.accuracyPct,
      totals.adaptations,
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
  return `${progressFileBase(student, now)}.csv`;
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

// Re-exported for callers that import the date helper from here.
export { isoDate };
