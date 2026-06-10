import { describe, it, expect } from "vitest";
import {
  buildProgressCsv,
  progressCsvFilename,
  QUARTER_DAYS,
} from "./csvExport";
import {
  AdaptationEvent,
  DomainId,
  SessionRecord,
  StudentProfile,
  TrialResult,
} from "@/engine/types";

const NOW = Date.UTC(2026, 5, 10); // 2026-06-10
const DAY = 24 * 60 * 60 * 1000;

const student: StudentProfile = {
  id: "stu1",
  name: "Ana García",
  avatar: "🦊",
  grade: "4th",
  readingLevel: "1st",
  goals: ["sightWords"],
  responseMethod: "touch",
  lowStim: false,
  attentionBaselineMin: 5,
  createdAt: 0,
};

function tr(correct: boolean): TrialResult {
  return {
    index: 0,
    templateId: "t",
    domain: "sightWords",
    numChoices: 2,
    correct,
    responseTimeMs: 1000,
    errorlessHighlight: false,
    timestamp: 0,
  };
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const trials = overrides.trials ?? [tr(true), tr(true), tr(false), tr(true)];
  const correct = trials.filter((t) => t.correct).length;
  return {
    id: "sess1",
    studentId: student.id,
    domain: "sightWords" as DomainId,
    startedAt: NOW - 2 * DAY,
    endedAt: NOW - 2 * DAY,
    trials,
    adaptations: [],
    endedEarly: false,
    accuracy: correct / trials.length,
    ...overrides,
  };
}

describe("buildProgressCsv", () => {
  it("includes a context header with the student's identifying info", () => {
    const csv = buildProgressCsv(student, [session()], QUARTER_DAYS, NOW);
    expect(csv).toContain("Student,Ana García");
    expect(csv).toContain("Grade,4th");
    expect(csv).toContain("Reading level,1st");
  });

  it("emits one data row per in-window session plus a TOTAL row", () => {
    const csv = buildProgressCsv(student, [session()], QUARTER_DAYS, NOW);
    const lines = csv.split("\r\n");
    expect(lines.some((l) => l.startsWith("2026-06-08,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("TOTAL,"))).toBe(true);
  });

  it("excludes sessions older than the reporting window", () => {
    const old = session({ startedAt: NOW - 200 * DAY });
    const recent = session({ startedAt: NOW - 5 * DAY });
    const csv = buildProgressCsv(student, [old, recent], QUARTER_DAYS, NOW);
    // The TOTAL row should reflect a single in-window session.
    expect(csv).toContain("TOTAL,1 sessions");
  });

  it("aggregates correct/total across in-window sessions", () => {
    // 3 of 4 correct => 75% overall.
    const csv = buildProgressCsv(student, [session()], QUARTER_DAYS, NOW);
    const total = csv.split("\r\n").find((l) => l.startsWith("TOTAL,"))!;
    // TOTAL,1 sessions,4,3,75,...
    const cols = total.split(",");
    expect(cols[2]).toBe("4");
    expect(cols[3]).toBe("3");
    expect(cols[4]).toBe("75");
  });

  it("summarizes adaptation kinds in a readable form", () => {
    const adaptations: AdaptationEvent[] = [
      { kind: "enable-errorless", trialIndex: 1, reason: "", timestamp: 0 },
      { kind: "enable-errorless", trialIndex: 2, reason: "", timestamp: 0 },
      { kind: "suggest-break", trialIndex: 3, reason: "", timestamp: 0 },
    ];
    const csv = buildProgressCsv(
      student,
      [session({ adaptations })],
      QUARTER_DAYS,
      NOW,
    );
    expect(csv).toContain("errorless prompt x2; break");
  });

  it("escapes fields containing commas or quotes per RFC 4180", () => {
    const tricky = { ...student, name: 'Smith, "Bo"' };
    const csv = buildProgressCsv(tricky, [session()], QUARTER_DAYS, NOW);
    expect(csv).toContain('Student,"Smith, ""Bo"""');
  });

  it("produces only a header and TOTAL when there are no sessions", () => {
    const csv = buildProgressCsv(student, [], QUARTER_DAYS, NOW);
    expect(csv).toContain("TOTAL,0 sessions");
  });
});

describe("progressCsvFilename", () => {
  it("builds a filesystem-safe name with a date", () => {
    expect(progressCsvFilename(student, NOW)).toBe(
      "Ana-Garc-a_progress_2026-06-10.csv",
    );
  });
});
