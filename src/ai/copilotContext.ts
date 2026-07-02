/**
 * Co-pilot context builder.
 *
 * Turns a student's profile + session history into a compact, structured
 * summary the model can reason over: per-domain accuracy trend, recent
 * misses, adaptation events, and session cadence. Kept pure (no IO) so it
 * can be unit-tested with synthetic `SessionRecord[]` and reused for both
 * the chat grounding and the IEP-draft prompt.
 *
 * The goal is a token-efficient brief, not a data dump — we summarize trends
 * rather than dumping every trial.
 */

import {
  AdaptationKind,
  DomainId,
  DOMAIN_LABELS,
  SessionRecord,
  StudentProfile,
} from "@/engine/types";

export interface DomainSummary {
  domain: DomainId;
  label: string;
  sessionCount: number;
  /** Accuracy of the most recent session (0..1), or null if none. */
  latestAccuracy: number | null;
  /** Mean accuracy across all sessions in this domain (0..1), or null. */
  meanAccuracy: number | null;
  /** "improving" | "declining" | "flat" — first-half vs second-half mean. */
  trend: "improving" | "declining" | "flat" | "insufficient-data";
  /** Total trials run in this domain. */
  totalTrials: number;
  /** Adaptation kinds seen, with counts. */
  adaptations: Partial<Record<AdaptationKind, number>>;
}

export interface CopilotContext {
  studentName: string;
  grade: string;
  readingLevel: string;
  responseMethod: string;
  lowStim: boolean;
  profileNote?: string;
  /** Total sessions across all domains. */
  totalSessions: number;
  /** Days since the most recent session, or null if none. */
  daysSinceLastSession: number | null;
  domains: DomainSummary[];
}

/** Round an accuracy fraction to a whole percentage, or null passthrough. */
function pct(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100);
}

/**
 * Build the structured context. `now` is injectable so tests are
 * deterministic; defaults to `Date.now()`.
 */
export function buildCopilotContext(
  student: StudentProfile,
  sessions: SessionRecord[],
  now: number = Date.now(),
): CopilotContext {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const lastAt = sorted.at(-1)?.startedAt ?? null;

  // Summarize each domain the student has a goal in, plus any domain with
  // data even if not a current goal (so the co-pilot sees the full picture).
  const domainIds = new Set<DomainId>(student.goals);
  for (const s of sorted) domainIds.add(s.domain);

  const domains: DomainSummary[] = [...domainIds].map((domain) => {
    const inDomain = sorted.filter((s) => s.domain === domain);
    const accuracies = inDomain.map((s) => s.accuracy);
    const totalTrials = inDomain.reduce((sum, s) => sum + s.trials.length, 0);

    const adaptations: Partial<Record<AdaptationKind, number>> = {};
    for (const s of inDomain) {
      for (const a of s.adaptations) {
        adaptations[a.kind] = (adaptations[a.kind] ?? 0) + 1;
      }
    }

    return {
      domain,
      label: DOMAIN_LABELS[domain],
      sessionCount: inDomain.length,
      latestAccuracy: accuracies.at(-1) ?? null,
      meanAccuracy: accuracies.length ? mean(accuracies) : null,
      trend: classifyTrend(accuracies),
      totalTrials,
      adaptations,
    };
  });

  return {
    studentName: student.name,
    grade: student.grade,
    readingLevel: student.readingLevel,
    responseMethod: student.responseMethod,
    lowStim: student.lowStim,
    profileNote: student.note,
    totalSessions: sorted.length,
    daysSinceLastSession:
      lastAt === null ? null : Math.floor((now - lastAt) / (1000 * 60 * 60 * 24)),
    domains,
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Classify a domain's accuracy trajectory by comparing the mean of the first
 * half of sessions to the mean of the second half. Needs ≥4 sessions to be
 * meaningful; below that we report insufficient data rather than guess.
 */
function classifyTrend(
  accuracies: number[],
): DomainSummary["trend"] {
  if (accuracies.length < 4) return "insufficient-data";
  const mid = Math.floor(accuracies.length / 2);
  const firstHalf = mean(accuracies.slice(0, mid));
  const secondHalf = mean(accuracies.slice(mid));
  const delta = secondHalf - firstHalf;
  if (delta > 0.05) return "improving";
  if (delta < -0.05) return "declining";
  return "flat";
}

const ADAPTATION_LABELS: Record<AdaptationKind, string> = {
  "increase-choices": "increased field size (made it harder)",
  "decrease-choices": "reduced field size (made it easier)",
  "enable-errorless": "enabled errorless prompting",
  "suggest-break": "suggested a break",
  "early-end": "ended the session early",
};

/**
 * Render the context as a compact plain-text brief for the model. Stable,
 * deterministic ordering so it caches well and reads consistently.
 */
export function renderContextBrief(ctx: CopilotContext): string {
  const lines: string[] = [];
  lines.push(`Student: ${ctx.studentName} (${ctx.grade} grade)`);
  lines.push(
    `Reads at: ${ctx.readingLevel} · Responds via: ${ctx.responseMethod}${ctx.lowStim ? " · low-stimulation profile" : ""}`,
  );
  if (ctx.profileNote) lines.push(`Teacher note: ${ctx.profileNote}`);
  lines.push(
    `Sessions on record: ${ctx.totalSessions}${
      ctx.daysSinceLastSession === null
        ? " (none yet)"
        : ` · last session ${ctx.daysSinceLastSession} day(s) ago`
    }`,
  );
  lines.push("");

  if (ctx.domains.every((d) => d.sessionCount === 0)) {
    lines.push("No session data yet for any goal area.");
    return lines.join("\n");
  }

  for (const d of ctx.domains) {
    lines.push(`Domain — ${d.label}:`);
    if (d.sessionCount === 0) {
      lines.push("  No sessions yet.");
      continue;
    }
    lines.push(
      `  ${d.sessionCount} session(s), ${d.totalTrials} trials. ` +
        `Latest accuracy ${pct(d.latestAccuracy)}%, mean ${pct(d.meanAccuracy)}%. Trend: ${d.trend}.`,
    );
    const adaptKinds = Object.keys(d.adaptations) as AdaptationKind[];
    if (adaptKinds.length > 0) {
      const parts = adaptKinds.map(
        (k) => `${ADAPTATION_LABELS[k]} ×${d.adaptations[k]}`,
      );
      lines.push(`  Engine adaptations: ${parts.join("; ")}.`);
    }
  }
  return lines.join("\n");
}
