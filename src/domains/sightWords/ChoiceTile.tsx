import { findWord } from "./trials";

interface Props {
  choiceId: string;
  /** When true, render in OpenDyslexic-style font. */
  dyslexicFont: boolean;
}

const AIWORD_PREFIX = "aiword:";

export function SightWordTile({ choiceId, dyslexicFont }: Props) {
  const word = resolveWord(choiceId);
  if (!word) return null;
  return (
    <span
      className={
        "text-5xl md:text-6xl font-semibold text-ink tracking-wide" +
        (dyslexicFont ? " font-dyslexic" : "")
      }
    >
      {word}
    </span>
  );
}

function resolveWord(id: string): string | null {
  if (id.startsWith(AIWORD_PREFIX)) return id.slice(AIWORD_PREFIX.length);
  return findWord(id)?.word ?? null;
}
