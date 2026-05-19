import { findSign } from "./trials";
import { SignSVG } from "./SignSVG";

export function SignTile({ choiceId }: { choiceId: string }) {
  const s = findSign(choiceId);
  if (!s) return null;
  return <SignSVG kind={s.kind} size={140} />;
}
