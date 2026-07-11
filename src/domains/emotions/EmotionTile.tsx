import { findEmotion } from "./trials";
import { FaceSVG } from "./FaceSVG";

/** Face plus the printed feeling word — the pairing is the teaching point. */
export function EmotionTile({ choiceId }: { choiceId: string }) {
  const e = findEmotion(choiceId);
  if (!e) return null;
  return (
    <span className="flex flex-col items-center gap-1.5">
      <FaceSVG kind={e.kind} label={e.spoken} size={112} />
      <span className="text-xl font-semibold text-ink tracking-wide">
        {e.label}
      </span>
    </span>
  );
}
