import { TrialTemplate } from "@/engine/types";

export type SignKind =
  | "stop"
  | "exit"
  | "restroom"
  | "walk"
  | "dontWalk"
  | "danger";

export interface SignItem {
  id: string;
  kind: SignKind;
  label: string;
  /** Spoken description used in prompts: "...the sign that means STOP" */
  meaning: string;
}

export const SIGNS: SignItem[] = [
  { id: "s-stop", kind: "stop", label: "Stop", meaning: "STOP" },
  { id: "s-exit", kind: "exit", label: "Exit", meaning: "EXIT" },
  { id: "s-restroom", kind: "restroom", label: "Restroom", meaning: "RESTROOM" },
  { id: "s-walk", kind: "walk", label: "Walk", meaning: "WALK" },
  { id: "s-dont-walk", kind: "dontWalk", label: "Don't Walk", meaning: "DO NOT WALK" },
  { id: "s-danger", kind: "danger", label: "Danger", meaning: "DANGER" },
];

export function findSign(id: string): SignItem | undefined {
  return SIGNS.find((s) => s.id === id);
}

export function buildSignTrials(): TrialTemplate[] {
  const choiceIds = SIGNS.map((s) => s.id);
  // Two passes through the set = 12 trials, weighted toward safety-critical
  // signs in the second pass.
  const out: TrialTemplate[] = [];
  let i = 0;
  for (const s of SIGNS) {
    out.push({
      id: `sg-${s.id}-${i++}`,
      prompt: `Touch the sign that means ${s.meaning}.`,
      correctChoiceId: s.id,
      choiceIds,
    });
  }
  for (const id of ["s-stop", "s-dont-walk", "s-danger", "s-restroom", "s-exit", "s-walk"] as const) {
    const s = findSign(id)!;
    out.push({
      id: `sg-${id}-${i++}`,
      prompt: `Touch the sign that means ${s.meaning}.`,
      correctChoiceId: id,
      choiceIds,
    });
  }
  return out;
}
