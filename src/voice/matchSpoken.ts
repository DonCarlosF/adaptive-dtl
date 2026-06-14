/**
 * Spoken-answer matching.
 *
 * Given a recognized transcript and the labelled choices currently on
 * screen, decide which choice (if any) the learner named. Kept as a pure
 * function so it can be unit-tested independently of the Web Speech API.
 *
 * Strategy, in order of confidence:
 *   1. Exact normalized equality (transcript === a label).
 *   2. Whole-word containment in either direction (transcript contains the
 *      label, or a label-word appears as a standalone token in the
 *      transcript). Handles "the dollar" → "dollar", "I think it's stop".
 *   3. Fuzzy: normalized Levenshtein similarity above a threshold, to
 *      tolerate recognizer slips ("doller" → "dollar").
 *
 * Returns the single best unambiguous match, or null when there is no
 * confident match or when two choices tie (we never guess between two).
 */

export interface SpokenChoice {
  id: string;
  label: string;
}

export interface SpokenMatch {
  id: string;
  label: string;
  /** 0..1 — how confident the match is (1 = exact). */
  score: number;
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity from edit distance, normalized by the longer string. */
function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - dist / max;
}

/** Default fuzzy acceptance threshold; tuned to accept ~1 slip per short word. */
export const DEFAULT_FUZZY_THRESHOLD = 0.72;

export function matchSpoken(
  transcript: string,
  choices: SpokenChoice[],
  fuzzyThreshold = DEFAULT_FUZZY_THRESHOLD,
): SpokenMatch | null {
  const heard = normalize(transcript);
  if (!heard) return null;
  const heardTokens = new Set(tokens(transcript));

  const scored: SpokenMatch[] = [];

  for (const choice of choices) {
    const label = normalize(choice.label);
    if (!label) continue;

    let score = 0;

    // 1. Exact.
    if (heard === label) {
      score = 1;
    } else if (
      // 2a. Transcript contains the full label phrase.
      heard.includes(label) ||
      // 2b. Any label word appears as a standalone spoken token.
      tokens(choice.label).some((w) => heardTokens.has(w))
    ) {
      score = 0.9;
    } else {
      // 3. Fuzzy against the whole phrase and best single token.
      const phraseSim = similarity(heard, label);
      const tokenSim = Math.max(
        0,
        ...[...heardTokens].map((t) => similarity(t, label)),
      );
      const best = Math.max(phraseSim, tokenSim);
      if (best >= fuzzyThreshold) score = best;
    }

    if (score > 0) scored.push({ id: choice.id, label: choice.label, score });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);

  // Refuse to guess between two equally-good matches.
  if (scored.length > 1 && scored[1].score === scored[0].score) return null;

  return scored[0];
}
