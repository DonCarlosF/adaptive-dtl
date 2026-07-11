import { findTime } from "./trials";
import { ClockSVG } from "./ClockSVG";

export function TimeTile({ choiceId }: { choiceId: string }) {
  const t = findTime(choiceId);
  if (!t) return null;
  return <ClockSVG hour={t.hour} minutes={t.minutes} label={t.label} size={140} />;
}
