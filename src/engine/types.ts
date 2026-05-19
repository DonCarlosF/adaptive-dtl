/**
 * Core types shared across the engine, DB, and UI.
 *
 * A "trial" is one discrete attempt: prompt → choice array → response.
 * A "session" is 8–12 trials in one domain.
 */

export type ReadingLevel = "PreK" | "K" | "1st" | "2nd";

export type ResponseMethod = "touch" | "eye gaze" | "both";

export type DomainId = "sightWords" | "moneyId" | "communitySigns";

export const DOMAIN_LABELS: Record<DomainId, string> = {
  sightWords: "Sight Words",
  moneyId: "Money ID",
  communitySigns: "Community Signs",
};

export interface StudentProfile {
  id: string;
  name: string;
  avatar: string;
  grade: string;
  readingLevel: ReadingLevel;
  goals: DomainId[];
  responseMethod: ResponseMethod;
  lowStim: boolean;
  /** Minutes (1–10), used to scale session length and break sensitivity. */
  attentionBaselineMin: number;
  /** Free-text teacher note. */
  note?: string;
  createdAt: number;
}

/** A single authored trial — domain content has many of these. */
export interface TrialTemplate {
  id: string;
  /** Spoken prompt e.g. "Touch the dollar." */
  prompt: string;
  /** id of the correct choice */
  correctChoiceId: string;
  /** All possible choice ids (engine picks N from these). */
  choiceIds: string[];
  /** Optional difficulty hint for ordering (1 easiest). */
  difficulty?: 1 | 2 | 3;
  /** Optional reading-level gate. */
  minReadingLevel?: ReadingLevel;
}

/** A trial as actually presented to the student (after engine selection). */
export interface PresentedTrial {
  templateId: string;
  prompt: string;
  correctChoiceId: string;
  /** The exact choices shown, in display order. */
  choiceIds: string[];
  /** When true, render the errorless highlight before the student responds. */
  errorlessHighlight: boolean;
}

export interface TrialResult {
  /** Index in the session, starting at 0. */
  index: number;
  templateId: string;
  domain: DomainId;
  numChoices: number;
  correct: boolean;
  /** ms from prompt-end to first response. */
  responseTimeMs: number;
  /** Was errorless highlight active? */
  errorlessHighlight: boolean;
  timestamp: number;
}

export type AdaptationKind =
  | "increase-choices"
  | "decrease-choices"
  | "enable-errorless"
  | "suggest-break"
  | "early-end";

export interface AdaptationEvent {
  kind: AdaptationKind;
  trialIndex: number;
  /** Plain-English reason for the teacher dashboard. */
  reason: string;
  timestamp: number;
}

export interface SessionState {
  studentId: string;
  domain: DomainId;
  trials: TrialResult[];
  adaptations: AdaptationEvent[];
  /** Current number of choices to present (2..4). */
  numChoices: 2 | 3 | 4;
  /** True when the next trial should show the errorless highlight. */
  errorlessHighlight: boolean;
  /** Streaks used by the rules engine. */
  correctStreak: number;
  incorrectStreak: number;
  /** Rolling average response time, recomputed on every trial. */
  rollingAvgRtMs: number;
}

export interface NextTrialDecision {
  /** Suggest taking a break before showing the next trial. */
  suggestBreak: boolean;
  /** End the session before reaching the planned trial count. */
  endEarly: boolean;
  /** Reason for early end, if endEarly is true. */
  endReason?: string;
  numChoices: 2 | 3 | 4;
  errorlessHighlight: boolean;
}

export interface SessionRecord {
  id: string;
  studentId: string;
  domain: DomainId;
  startedAt: number;
  endedAt: number;
  trials: TrialResult[];
  adaptations: AdaptationEvent[];
  /** Was this session shortened by the engine? */
  endedEarly: boolean;
  /** Cached for charting. */
  accuracy: number;
  /** True if the trial set used in this session came from the AI generator. */
  aiGenerated?: boolean;
  /** Recorded simulated gaze samples (only when eye tracking was on). */
  gazeTrace?: GazeTracePoint[];
}

/** Simulated gaze sample, optionally tagged with the trial it occurred in. */
export interface GazeTracePoint {
  x: number;
  y: number;
  timestamp: number;
  confidence: number;
  /** -1 means "not in a trial" (e.g. between trials, on break screen). */
  trialIndex: number;
  /** True if this sample is outside the viewport. */
  offScreen: boolean;
}

/** Cached AI-generated trial set, keyed by (student, domain, contentHash). */
export interface AIGeneratedSet {
  /** Composite id: `${studentId}::${domain}::${contentHash}`. */
  id: string;
  studentId: string;
  domain: DomainId;
  /** Hash of the prompt inputs that produced this set. */
  contentHash: string;
  /** The model that produced these trials. */
  model: string;
  templates: TrialTemplate[];
  generatedAt: number;
}
