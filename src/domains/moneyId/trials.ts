import { TrialTemplate } from "@/engine/types";

export type MoneyKind = "coin" | "bill";

export interface MoneyItem {
  id: string;
  kind: MoneyKind;
  /** Display label e.g. "Quarter", "One Dollar". */
  label: string;
  /** Spoken target in prompt e.g. "the quarter". */
  spoken: string;
  /** Cents value (used for ordering and future "make change" trials). */
  cents: number;
  /** Color hint for SVG fill (coins only). */
  tone?: "copper" | "silver" | "silverLg";
}

export const MONEY_ITEMS: MoneyItem[] = [
  {
    id: "m-penny",
    kind: "coin",
    label: "Penny",
    spoken: "penny",
    cents: 1,
    tone: "copper",
  },
  {
    id: "m-nickel",
    kind: "coin",
    label: "Nickel",
    spoken: "nickel",
    cents: 5,
    tone: "silver",
  },
  {
    id: "m-dime",
    kind: "coin",
    label: "Dime",
    spoken: "dime",
    cents: 10,
    tone: "silver",
  },
  {
    id: "m-quarter",
    kind: "coin",
    label: "Quarter",
    spoken: "quarter",
    cents: 25,
    tone: "silverLg",
  },
  {
    id: "m-bill-1",
    kind: "bill",
    label: "One Dollar",
    spoken: "dollar",
    cents: 100,
  },
  {
    id: "m-bill-5",
    kind: "bill",
    label: "Five Dollars",
    spoken: "five dollars",
    cents: 500,
  },
];

export function findMoney(id: string): MoneyItem | undefined {
  return MONEY_ITEMS.find((m) => m.id === id);
}

export function buildMoneyTrials(): TrialTemplate[] {
  // Repeat each item to pad to ~15 trials per session; the engine will
  // pick distractors and randomize order at presentation time.
  const out: TrialTemplate[] = [];
  const choiceIds = MONEY_ITEMS.map((m) => m.id);
  let i = 0;
  for (const item of MONEY_ITEMS) {
    out.push({
      id: `mn-${item.id}-${i++}`,
      prompt: `Touch the ${item.spoken}.`,
      correctChoiceId: item.id,
      choiceIds,
    });
  }
  // Add a second pass weighted toward common-use coins.
  for (const id of ["m-quarter", "m-dime", "m-nickel", "m-bill-1"] as const) {
    const it = findMoney(id)!;
    out.push({
      id: `mn-${id}-${i++}`,
      prompt: `Touch the ${it.spoken}.`,
      correctChoiceId: id,
      choiceIds,
    });
  }
  return out;
}
