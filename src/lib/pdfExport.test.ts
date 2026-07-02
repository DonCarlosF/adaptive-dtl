import { describe, it, expect } from "vitest";
import { buildProgressHtml } from "./pdfExport";
import { QUARTER_DAYS } from "./progressReport";
import { SessionRecord, StudentProfile, TrialResult } from "@/engine/types";

const NOW = Date.UTC(2026, 5, 10);
const DAY = 24 * 60 * 60 * 1000;

const student: StudentProfile = {
  id: "stu1",
  name: "Marcus <Test>",
  avatar: "🦊",
  grade: "3rd",
  readingLevel: "K",
  goals: ["sightWords"],
  responseMethod: "touch",
  lowStim: true,
  attentionBaselineMin: 4,
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

function session(): SessionRecord {
  const trials = [tr(true), tr(true), tr(false), tr(true)];
  return {
    id: "s1",
    studentId: student.id,
    domain: "sightWords",
    startedAt: NOW - 3 * DAY,
    endedAt: NOW - 3 * DAY,
    trials,
    adaptations: [],
    endedEarly: false,
    accuracy: 0.75,
  };
}

describe("buildProgressHtml", () => {
  it("produces a full HTML document", () => {
    const html = buildProgressHtml(student, [session()], QUARTER_DAYS, NOW);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("</html>");
  });

  it("escapes HTML-special characters in the student name", () => {
    const html = buildProgressHtml(student, [session()], QUARTER_DAYS, NOW);
    expect(html).toContain("Marcus &lt;Test&gt;");
    expect(html).not.toContain("Marcus <Test>");
  });

  it("includes the totals and reporting window", () => {
    const html = buildProgressHtml(student, [session()], QUARTER_DAYS, NOW);
    expect(html).toContain("1 sessions");
    expect(html).toContain("75%");
    expect(html).toContain("ending 2026-06-10");
  });

  it("shows an empty-state note when there are no in-window sessions", () => {
    const html = buildProgressHtml(student, [], QUARTER_DAYS, NOW);
    expect(html).toContain("No sessions in this reporting window.");
  });
});
