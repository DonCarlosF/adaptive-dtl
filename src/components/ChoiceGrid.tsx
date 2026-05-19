import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ChoiceItem {
  id: string;
  render: ReactNode;
  ariaLabel: string;
}

interface Props {
  choices: ChoiceItem[];
  /** id of the correct choice */
  correctId: string;
  /** Last tapped id, if any */
  selectedId: string | null;
  /** True after an incorrect tap; correct choice gets sage outline, others fade. */
  errorlessHighlight: boolean;
  /** Disable interaction (during reinforcer) */
  locked: boolean;
  onChoose: (id: string) => void;
}

/**
 * Responsive grid that lays choices out in 2, 3, or 4 columns depending on
 * count. Tiles are at minimum 120px square with 24px gaps per the spec.
 */
export function ChoiceGrid({
  choices,
  correctId,
  selectedId,
  errorlessHighlight,
  locked,
  onChoose,
}: Props) {
  const cols = choices.length <= 2 ? 2 : choices.length === 3 ? 3 : 4;

  return (
    <div
      className="grid mx-auto"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(120px, 1fr))`,
        gap: 24,
        maxWidth: cols * 220,
      }}
    >
      {choices.map((c) => {
        const isCorrect = c.id === correctId;
        const isSelected = c.id === selectedId;
        const incorrectAfterTap =
          errorlessHighlight && !isCorrect && selectedId != null;

        return (
          <button
            key={c.id}
            data-choice-id={c.id}
            disabled={locked}
            onClick={() => onChoose(c.id)}
            aria-label={c.ariaLabel}
            className={cn(
              "group relative flex items-center justify-center min-h-[140px] min-w-[120px]",
              "bg-white rounded-tile border-2 transition-all duration-300 ease-out",
              "shadow-tile p-4 select-none",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500",
              !locked && "hover:-translate-y-0.5 hover:shadow-card",
              errorlessHighlight && isCorrect
                ? "border-sage ring-4 ring-sage-100"
                : "border-line",
              incorrectAfterTap && "opacity-20",
              isSelected && !errorlessHighlight && "border-sage",
            )}
          >
            <div className="w-full h-full flex items-center justify-center">
              {c.render}
            </div>
          </button>
        );
      })}
    </div>
  );
}
