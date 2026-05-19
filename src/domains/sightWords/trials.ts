import { ReadingLevel, TrialTemplate } from "@/engine/types";

/**
 * Hand-authored sight-word trials drawn from the Dolch list, leveled
 * roughly to the reading-level bands used in our IEPs.
 *
 * Each entry's `correctChoiceId` is one of the words in `choiceIds`.
 * Engine picks N choices to display per trial; the rest of the words
 * in the level pool are reused as distractors as needed.
 */

export interface SightWord {
  id: string;
  word: string;
  level: ReadingLevel;
}

export const SIGHT_WORDS: SightWord[] = [
  { id: "w-the", word: "the", level: "PreK" },
  { id: "w-a", word: "a", level: "PreK" },
  { id: "w-i", word: "I", level: "PreK" },
  { id: "w-is", word: "is", level: "PreK" },
  { id: "w-it", word: "it", level: "PreK" },
  { id: "w-go", word: "go", level: "PreK" },
  { id: "w-see", word: "see", level: "PreK" },
  { id: "w-my", word: "my", level: "PreK" },
  { id: "w-and", word: "and", level: "K" },
  { id: "w-can", word: "can", level: "K" },
  { id: "w-here", word: "here", level: "K" },
  { id: "w-look", word: "look", level: "K" },
  { id: "w-me", word: "me", level: "K" },
  { id: "w-not", word: "not", level: "K" },
  { id: "w-play", word: "play", level: "K" },
  { id: "w-said", word: "said", level: "K" },
  { id: "w-you", word: "you", level: "K" },
  { id: "w-with", word: "with", level: "K" },
  { id: "w-all", word: "all", level: "1st" },
  { id: "w-ate", word: "ate", level: "1st" },
  { id: "w-from", word: "from", level: "1st" },
  { id: "w-have", word: "have", level: "1st" },
  { id: "w-must", word: "must", level: "1st" },
  { id: "w-please", word: "please", level: "1st" },
  { id: "w-stop", word: "stop", level: "1st" },
  { id: "w-want", word: "want", level: "1st" },
  { id: "w-after", word: "after", level: "2nd" },
  { id: "w-around", word: "around", level: "2nd" },
  { id: "w-because", word: "because", level: "2nd" },
  { id: "w-every", word: "every", level: "2nd" },
];

const LEVEL_ORDER: ReadingLevel[] = ["PreK", "K", "1st", "2nd"];

export function wordsForLevel(level: ReadingLevel): SightWord[] {
  // Include the requested level and one below for review trials.
  const i = LEVEL_ORDER.indexOf(level);
  const allowed = new Set([
    LEVEL_ORDER[Math.max(0, i - 1)],
    LEVEL_ORDER[i],
  ]);
  return SIGHT_WORDS.filter((w) => allowed.has(w.level));
}

/**
 * Build the trial templates for a session at the given reading level.
 * The engine will then pick N distractors per trial at presentation time.
 */
export function buildSightWordTrials(level: ReadingLevel): TrialTemplate[] {
  const pool = wordsForLevel(level);
  if (pool.length < 4) return [];
  const choiceIds = pool.map((w) => w.id);

  return pool.map((target) => ({
    id: `sw-${target.id}`,
    prompt: `Touch the word ${target.word}.`,
    correctChoiceId: target.id,
    choiceIds,
    minReadingLevel: target.level,
  }));
}

export function findWord(id: string): SightWord | undefined {
  return SIGHT_WORDS.find((w) => w.id === id);
}
