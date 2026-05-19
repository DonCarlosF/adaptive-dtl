import { findMoney } from "./trials";
import { CoinSVG } from "./CoinSVG";
import { BillSVG } from "./BillSVG";

export function MoneyTile({ choiceId }: { choiceId: string }) {
  const m = findMoney(choiceId);
  if (!m) return null;
  if (m.kind === "coin") {
    return <CoinSVG cents={m.cents as 1 | 5 | 10 | 25} size={120} />;
  }
  return <BillSVG dollars={m.cents === 100 ? 1 : 5} size={150} />;
}
