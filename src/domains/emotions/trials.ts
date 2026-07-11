import { TrialTemplate } from "@/engine/types";

/**
 * Emotions — recognizing how someone feels from a facial expression.
 * A functional emotional-regulation skill: naming a feeling is the first
 * step of most classroom regulation programs (Zones-style), and it
 * generalizes to reading peers and adults.
 */

export type EmotionKind =
  | "happy"
  | "sad"
  | "angry"
  | "scared"
  | "surprised"
  | "tired"
  | "calm"
  | "excited";

export interface EmotionItem {
  id: string;
  kind: EmotionKind;
  /** Display label under the face, e.g. "Happy". */
  label: string;
  /** Spoken word used in prompts and aria labels, e.g. "happy". */
  spoken: string;
}

export const EMOTIONS: EmotionItem[] = [
  { id: "e-happy", kind: "happy", label: "Happy", spoken: "happy" },
  { id: "e-sad", kind: "sad", label: "Sad", spoken: "sad" },
  { id: "e-angry", kind: "angry", label: "Angry", spoken: "angry" },
  { id: "e-scared", kind: "scared", label: "Scared", spoken: "scared" },
  { id: "e-surprised", kind: "surprised", label: "Surprised", spoken: "surprised" },
  { id: "e-tired", kind: "tired", label: "Tired", spoken: "tired" },
  { id: "e-calm", kind: "calm", label: "Calm", spoken: "calm" },
  { id: "e-excited", kind: "excited", label: "Excited", spoken: "excited" },
];

export function findEmotion(id: string): EmotionItem | undefined {
  return EMOTIONS.find((e) => e.id === id);
}

export function buildEmotionTrials(): TrialTemplate[] {
  const choiceIds = EMOTIONS.map((e) => e.id);
  const out: TrialTemplate[] = [];
  let i = 0;
  // First pass: every emotion once.
  for (const e of EMOTIONS) {
    out.push({
      id: `em-${e.id}-${i++}`,
      prompt: `Touch the person who feels ${e.spoken}.`,
      correctChoiceId: e.id,
      choiceIds,
    });
  }
  // Second pass weighted toward the core regulation vocabulary — the four
  // feelings students most need to name about themselves during the day.
  for (const id of ["e-happy", "e-sad", "e-angry", "e-calm"] as const) {
    const e = findEmotion(id)!;
    out.push({
      id: `em-${id}-${i++}`,
      prompt: `Touch the person who feels ${e.spoken}.`,
      correctChoiceId: id,
      choiceIds,
    });
  }
  return out;
}
