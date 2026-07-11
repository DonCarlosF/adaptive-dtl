import {
  AdaptationEvent,
  DomainId,
  SessionRecord,
  StudentProfile,
  TrialResult,
} from "@/engine/types";
import { db, DEFAULT_SETTINGS } from "./schema";

const DAY = 1000 * 60 * 60 * 24;

const STUDENTS: StudentProfile[] = [
  {
    id: "stu-marcus",
    name: "Marcus",
    avatar: "🦊",
    grade: "3rd",
    readingLevel: "K",
    // --- domains-expansion --- emotions added so the new domain has demo data.
    goals: ["sightWords", "moneyId", "emotions"],
    // --- end domains-expansion ---
    responseMethod: "touch",
    lowStim: true,
    attentionBaselineMin: 2,
    note: "Loves animals, gets overwhelmed by celebration animations.",
    createdAt: Date.now() - 30 * DAY,
  },
  {
    id: "stu-aaliyah",
    name: "Aaliyah",
    avatar: "🦋",
    grade: "4th",
    readingLevel: "1st",
    // --- domains-expansion --- timeTelling added so the new domain has demo data.
    goals: ["sightWords", "moneyId", "communitySigns", "timeTelling"],
    // --- end domains-expansion ---
    responseMethod: "both",
    lowStim: false,
    attentionBaselineMin: 5,
    note: "Strong visual learner, working on functional sight words.",
    createdAt: Date.now() - 28 * DAY,
  },
  {
    id: "stu-deshawn",
    name: "DeShawn",
    avatar: "🐉",
    grade: "5th",
    readingLevel: "PreK",
    goals: ["moneyId", "communitySigns"],
    responseMethod: "eye gaze",
    lowStim: true,
    attentionBaselineMin: 3,
    note: "Non-verbal, uses eye gaze on AAC device, working on community independence skills.",
    createdAt: Date.now() - 26 * DAY,
  },
];

/**
 * Reproducible-ish "fake but realistic" session generator. The accuracy
 * trends upward with mild noise — like a kid actually learning. We log
 * a couple of adaptation events per session so the dashboard list isn't
 * empty.
 */
function fakeSession(
  studentId: string,
  domain: DomainId,
  daysAgo: number,
  baseAccuracy: number,
  index: number,
): SessionRecord {
  const startedAt = Date.now() - daysAgo * DAY;
  const trialCount = 8 + ((index + daysAgo) % 4); // 8..11
  const seed = hash(studentId + domain + daysAgo);
  const targetAccuracy = clamp(
    baseAccuracy + (index * 0.04) + ((seed % 20) - 10) / 100,
    0.25,
    0.95,
  );
  const trials: TrialResult[] = [];
  let correctStreak = 0;
  let incorrectStreak = 0;
  const adaptations: AdaptationEvent[] = [];
  let numChoices: 2 | 3 | 4 = 2;

  for (let i = 0; i < trialCount; i++) {
    const r = pseudoRandom(seed + i);
    const correct = r < targetAccuracy;
    if (correct) {
      correctStreak += 1;
      incorrectStreak = 0;
      if (correctStreak >= 3 && numChoices < 4) {
        numChoices = (numChoices + 1) as 2 | 3 | 4;
        adaptations.push({
          kind: "increase-choices",
          trialIndex: i,
          reason: `3 correct in a row — increased to ${numChoices} choices.`,
          timestamp: startedAt + i * 8000,
        });
      }
    } else {
      incorrectStreak += 1;
      correctStreak = 0;
      if (incorrectStreak >= 2 && numChoices > 2) {
        numChoices = 2;
        adaptations.push({
          kind: "decrease-choices",
          trialIndex: i,
          reason: "2 incorrect in a row — dropped back to 2 choices.",
          timestamp: startedAt + i * 8000,
        });
        adaptations.push({
          kind: "enable-errorless",
          trialIndex: i,
          reason: "Showing errorless highlight next trial.",
          timestamp: startedAt + i * 8000,
        });
      }
    }
    trials.push({
      index: i,
      templateId: `${domain}-${i}`,
      domain,
      numChoices,
      correct,
      responseTimeMs: 1800 + Math.floor(pseudoRandom(seed + 100 + i) * 2400),
      errorlessHighlight: incorrectStreak >= 2,
      timestamp: startedAt + i * 8000,
    });
  }

  const accuracy = trials.filter((t) => t.correct).length / trials.length;
  return {
    id: `sess-${studentId}-${domain}-${daysAgo}`,
    studentId,
    domain,
    startedAt,
    endedAt: startedAt + trials.length * 8000,
    trials,
    adaptations,
    endedEarly: false,
    accuracy,
  };
}

// --- domains-expansion --- explicit per-domain starting accuracy for the
// fake history generator (was a ternary over the original three domains).
const BASE_ACC: Record<DomainId, number> = {
  sightWords: 0.55,
  moneyId: 0.5,
  communitySigns: 0.6,
  timeTelling: 0.45,
  emotions: 0.65,
};
// --- end domains-expansion ---

function generateHistoryFor(student: StudentProfile): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  for (const domain of student.goals) {
    // 4–6 sessions, staggered over the past three weeks.
    const count = 4 + ((hash(student.id + domain) % 3));
    const baseAcc = BASE_ACC[domain];
    for (let i = 0; i < count; i++) {
      const daysAgo = 21 - i * 4;
      sessions.push(fakeSession(student.id, domain, daysAgo, baseAcc, i));
    }
  }
  return sessions;
}

export async function seedIfEmpty(): Promise<void> {
  const studentCount = await db.students.count();
  if (studentCount > 0) return;

  await db.transaction("rw", db.students, db.sessions, db.settings, async () => {
    for (const s of STUDENTS) {
      await db.students.put(s);
      const history = generateHistoryFor(s);
      for (const h of history) {
        await db.sessions.put(h);
      }
    }
    const existing = await db.settings.get("app");
    if (!existing) await db.settings.put(DEFAULT_SETTINGS);
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

/** Mulberry32-ish, deterministic 0..1 from an integer seed. */
function pseudoRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
