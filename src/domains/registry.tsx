import { ReactNode } from "react";
import { DomainId, ReadingLevel, TrialTemplate } from "@/engine/types";
import {
  buildSightWordTrials,
  findWord,
  SIGHT_WORDS,
} from "./sightWords/trials";
import { SightWordTile } from "./sightWords/ChoiceTile";
import { buildMoneyTrials, findMoney, MONEY_ITEMS } from "./moneyId/trials";
import { MoneyTile } from "./moneyId/MoneyTile";
import { buildSignTrials, findSign, SIGNS } from "./communitySigns/trials";
import { SignTile } from "./communitySigns/SignTile";
// --- domains-expansion ---
import { buildTimeTrials, findTime, TIME_ITEMS } from "./timeTelling/trials";
import { TimeTile } from "./timeTelling/TimeTile";
import { buildEmotionTrials, findEmotion, EMOTIONS } from "./emotions/trials";
import { EmotionTile } from "./emotions/EmotionTile";
// --- end domains-expansion ---

/** Item exposed to the AI generator's prompt: id + plain label. */
export interface AIItem {
  id: string;
  label: string;
}

interface DomainModule {
  id: DomainId;
  buildTrials: (level: ReadingLevel) => TrialTemplate[];
  renderChoice: (choiceId: string, opts: { dyslexicFont: boolean }) => ReactNode;
  ariaLabel: (choiceId: string) => string;
  /** Items the AI generator may reference by id when building trials. */
  availableForAI: () => AIItem[];
  /** True if a choice id is renderable in this domain (existing OR aiword:). */
  isValidChoiceId: (id: string) => boolean;
}

const AIWORD_PREFIX = "aiword:";

const sightWords: DomainModule = {
  id: "sightWords",
  buildTrials: (level) => buildSightWordTrials(level),
  renderChoice: (id, { dyslexicFont }) => (
    <SightWordTile choiceId={id} dyslexicFont={dyslexicFont} />
  ),
  ariaLabel: (id) => {
    if (id.startsWith(AIWORD_PREFIX)) return id.slice(AIWORD_PREFIX.length);
    return findWord(id)?.word ?? "word";
  },
  availableForAI: () =>
    SIGHT_WORDS.map((w) => ({ id: w.id, label: w.word })),
  isValidChoiceId: (id) =>
    id.startsWith(AIWORD_PREFIX) || !!findWord(id),
};

const moneyId: DomainModule = {
  id: "moneyId",
  buildTrials: () => buildMoneyTrials(),
  renderChoice: (id) => <MoneyTile choiceId={id} />,
  ariaLabel: (id) => findMoney(id)?.label ?? "money",
  availableForAI: () => MONEY_ITEMS.map((m) => ({ id: m.id, label: m.label })),
  isValidChoiceId: (id) => !!findMoney(id),
};

const communitySigns: DomainModule = {
  id: "communitySigns",
  buildTrials: () => buildSignTrials(),
  renderChoice: (id) => <SignTile choiceId={id} />,
  ariaLabel: (id) => findSign(id)?.label ?? "sign",
  availableForAI: () => SIGNS.map((s) => ({ id: s.id, label: s.label })),
  isValidChoiceId: (id) => !!findSign(id),
};

// --- domains-expansion ---
const timeTelling: DomainModule = {
  id: "timeTelling",
  buildTrials: () => buildTimeTrials(),
  renderChoice: (id) => <TimeTile choiceId={id} />,
  ariaLabel: (id) => findTime(id)?.label ?? "clock",
  availableForAI: () => TIME_ITEMS.map((t) => ({ id: t.id, label: t.label })),
  isValidChoiceId: (id) => !!findTime(id),
};

const emotions: DomainModule = {
  id: "emotions",
  buildTrials: () => buildEmotionTrials(),
  renderChoice: (id) => <EmotionTile choiceId={id} />,
  ariaLabel: (id) => findEmotion(id)?.spoken ?? "feeling",
  availableForAI: () => EMOTIONS.map((e) => ({ id: e.id, label: e.label })),
  isValidChoiceId: (id) => !!findEmotion(id),
};
// --- end domains-expansion ---

const REGISTRY: Record<DomainId, DomainModule> = {
  sightWords,
  moneyId,
  communitySigns,
  // --- domains-expansion ---
  timeTelling,
  emotions,
  // --- end domains-expansion ---
};

export function getDomain(id: DomainId): DomainModule {
  return REGISTRY[id];
}
