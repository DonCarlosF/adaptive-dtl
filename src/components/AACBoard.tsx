import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSpeak } from "@/hooks/useSpeak";
import { usePrefersReducedMotion } from "@/a11y/usePrefersReducedMotion";

/**
 * AAC core-vocabulary board.
 *
 * A full-screen overlay of large core-word tiles. Tapping a tile speaks the
 * word aloud (TTS) so a non-verbal learner can communicate intent during a
 * session. A few words also carry session semantics — "break"/"help" can
 * trigger a break, "again" re-reads the prompt, "done" can end — wired by
 * the host via the optional callbacks below. Words with no callback simply
 * speak.
 *
 * Accessibility: rendered as a labelled `dialog`, focus moves to the panel on
 * open and Escape closes. Every tile is a real button (keyboard/AT operable)
 * with a large hit target and an `aria-label`.
 */

export type AACWord =
  | "yes"
  | "no"
  | "more"
  | "stop"
  | "help"
  | "break"
  | "again"
  | "done";

interface AACTile {
  word: AACWord;
  label: string;
  symbol: string;
  /** Tailwind tile tint. */
  tint: string;
}

// Calm, high-contrast tints drawn from the palette + default Tailwind scale.
const TILES: AACTile[] = [
  { word: "yes", label: "Yes", symbol: "👍", tint: "bg-sage-50 border-sage-200" },
  { word: "no", label: "No", symbol: "👎", tint: "bg-coral-soft/40 border-coral-soft" },
  { word: "more", label: "More", symbol: "➕", tint: "bg-sage-50 border-sage-200" },
  { word: "stop", label: "Stop", symbol: "✋", tint: "bg-coral-soft/40 border-coral-soft" },
  { word: "help", label: "Help", symbol: "🙋", tint: "bg-amber-50 border-amber-200" },
  { word: "break", label: "Break", symbol: "🧘", tint: "bg-sky-50 border-sky-200" },
  { word: "again", label: "Again", symbol: "🔁", tint: "bg-sky-50 border-sky-200" },
  { word: "done", label: "Done", symbol: "✅", tint: "bg-sage-50 border-sage-200" },
];

export interface AACBoardCallbacks {
  /** "break" or "help" tapped — host may move the session to a break. */
  onBreak?: () => void;
  /** "again" tapped — host may re-read the current prompt. */
  onAgain?: () => void;
  /** "done" tapped — host may end / acknowledge completion. */
  onDone?: () => void;
}

interface Props extends AACBoardCallbacks {
  open: boolean;
  onClose: () => void;
  /** Audio volume 0..1 for TTS, matching session settings. */
  volume?: number;
}

export function AACBoard({
  open,
  onClose,
  onBreak,
  onAgain,
  onDone,
  volume = 1,
}: Props) {
  const { speak } = useSpeak();
  const reduceMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Move focus into the dialog when it opens (focus management, WCAG 2.4.3).
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleTap = (word: AACWord, label: string) => {
    speak(label, { volume });
    switch (word) {
      case "break":
      case "help":
        onBreak?.();
        break;
      case "again":
        onAgain?.();
        break;
      case "done":
        onDone?.();
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Communication board"
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-3xl rounded-tile bg-white p-6 shadow-card outline-none",
          !reduceMotion && "animate-softIn",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Tap to talk</h2>
          <button
            onClick={onClose}
            aria-label="Close communication board"
            className="rounded-tile p-2 text-muted hover:bg-sage-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TILES.map((tile) => (
            <button
              key={tile.word}
              data-aac-word={tile.word}
              onClick={() => handleTap(tile.word, tile.label)}
              aria-label={tile.label}
              className={cn(
                "flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-tile border-2 p-4",
                "shadow-tile transition-transform select-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500",
                !reduceMotion && "hover:-translate-y-0.5",
                tile.tint,
              )}
            >
              <span className="text-4xl" aria-hidden="true">
                {tile.symbol}
              </span>
              <span className="text-base font-medium text-ink">{tile.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
