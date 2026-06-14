import { describe, it, expect } from "vitest";
import {
  buildCopilotContext,
  renderContextBrief,
} from "./copilotContext";
import {
  AdaptationEvent,
  DomainId,
  SessionRecord,
  StudentProfile,
  TrialResult,
} from "@/engine/types";

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000;

function student(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: "s1",
    name: "Robin",
    avatar: "🦊",
    grade: "4th",
    readingLevel: "1st",
    goals: ["sightWords", "moneyId"],
    responseMethod: "touch",
    lowStim: true,
    attentionBaselineMin: 5,
    note: "Loves animals.",
    createdAt: NOW - 30 * DAY,
    ...overrides,
  };
}

function session(
  domain: DomainId,
  accuracy: number,
  startedAt: number,
  opts: { trials?: number; adaptations?: AdaptationEvent[] } = {},
): SessionRecord {
  const n = opts.trials ?? 8;
  const trials: TrialResult[] = Array.from({ length: n }, (_, i) => ({
    index: i,
    templateId: `t-${i}`,
    domain,
    numChoices: 3,
    correct: i / n < accuracy,
    responseTimeMs: 1200,
    errorlessHighlight: false,
    timestamp: startedAt + i * 1000,
  }));
  return {
    id: `${domain}-${startedAt}`,
    studentId: "s1",
    domain,
    startedAt,
    endedAt: startedAt + n * 1000,
    trials,
    adaptations: opts.adaptations ?? [],
    endedEarly: false,
    accuracy,
  };
}

describe("buildCopilotContext", () => {
  it("summarizes per-domain accuracy, trend, and trials", () => {
    const sessions: SessionRecord[] = [
      session("sightWords", 0.4, NOW - 8 * DAY),
      session("sightWords", 0.5, NOW - 6 * DAY),
      session("sightWords", 0.7, NOW - 4 * DAY),
      session("sightWords", 0.85, NOW - 2 * DAY),
    ];
    const ctx = buildCopilotContext(student(), sessions, NOW);

    const sw = ctx.domains.find((d) => d.domain === "sightWords")!;
    expect(sw.sessionCount).toBe(4);
    expect(sw.latestAccuracy).toBeCloseTo(0.85);
    expect(sw.trend).toBe("improving");
    expect(sw.totalTrials).toBe(32);
    expect(ctx.totalSessions).toBe(4);
    expect(ctx.daysSinceLastSession).toBe(2);
  });

  it("reports insufficient-data trend below 4 sessions", () => {
    const ctx = buildCopilotContext(
      student(),
      [session("sightWords", 0.4, NOW - 2 * DAY), session("sightWords", 0.9, NOW - DAY)],
      NOW,
    );
    expect(ctx.domains.find((d) => d.domain === "sightWords")!.trend).toBe(
      "insufficient-data",
    );
  });

  it("detects a declining trend", () => {
    const sessions = [
      session("moneyId", 0.9, NOW - 8 * DAY),
      session("moneyId", 0.85, NOW - 6 * DAY),
      session("moneyId", 0.5, NOW - 4 * DAY),
      session("moneyId", 0.45, NOW - 2 * DAY),
    ];
    const ctx = buildCopilotContext(student(), sessions, NOW);
    expect(ctx.domains.find((d) => d.domain === "moneyId")!.trend).toBe("declining");
  });

  it("counts adaptation events by kind", () => {
    const adaptations: AdaptationEvent[] = [
      { kind: "enable-errorless", trialIndex: 2, reason: "x", timestamp: NOW },
      { kind: "enable-errorless", trialIndex: 4, reason: "y", timestamp: NOW },
      { kind: "suggest-break", trialIndex: 5, reason: "z", timestamp: NOW },
    ];
    const ctx = buildCopilotContext(
      student(),
      [session("sightWords", 0.6, NOW - DAY, { adaptations })],
      NOW,
    );
    const sw = ctx.domains.find((d) => d.domain === "sightWords")!;
    expect(sw.adaptations["enable-errorless"]).toBe(2);
    expect(sw.adaptations["suggest-break"]).toBe(1);
  });

  it("includes goal domains with no sessions, and data-only non-goal domains", () => {
    const ctx = buildCopilotContext(
      student({ goals: ["sightWords"] }),
      [session("communitySigns", 0.7, NOW - DAY)], // not a current goal
      NOW,
    );
    const domains = ctx.domains.map((d) => d.domain).sort();
    expect(domains).toContain("sightWords"); // goal, zero sessions
    expect(domains).toContain("communitySigns"); // data-only
    expect(ctx.domains.find((d) => d.domain === "sightWords")!.sessionCount).toBe(0);
  });

  it("handles a student with no sessions at all", () => {
    const ctx = buildCopilotContext(student(), [], NOW);
    expect(ctx.totalSessions).toBe(0);
    expect(ctx.daysSinceLastSession).toBeNull();
    expect(ctx.domains.every((d) => d.sessionCount === 0)).toBe(true);
  });
});

describe("renderContextBrief", () => {
  it("renders the student header and per-domain lines", () => {
    const sessions = [
      session("sightWords", 0.4, NOW - 8 * DAY),
      session("sightWords", 0.5, NOW - 6 * DAY),
      session("sightWords", 0.7, NOW - 4 * DAY),
      session("sightWords", 0.85, NOW - 2 * DAY),
    ];
    const brief = renderContextBrief(buildCopilotContext(student(), sessions, NOW));
    expect(brief).toContain("Robin");
    expect(brief).toContain("Sight Words");
    expect(brief).toContain("85%");
    expect(brief).toContain("improving");
    expect(brief).toContain("Loves animals.");
  });

  it("states plainly when there is no data", () => {
    const brief = renderContextBrief(buildCopilotContext(student(), [], NOW));
    expect(brief).toContain("No session data yet");
  });
});
