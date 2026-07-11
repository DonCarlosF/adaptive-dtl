import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSpeak } from "@/hooks/useSpeak";
import { usePrefersReducedMotion } from "@/a11y/usePrefersReducedMotion";
import { t, ttsLang, StringKey } from "@/i18n/strings";

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
 * Personalization: the host may pass `extraWords` — the student's own
 * fringe vocabulary (favourite items, people) — rendered as a visually
 * distinct "My words" group with the same tap-to-speak behavior.
 *
 * Localization: core-word labels, aria labels, and TTS follow the
 * student-facing language (src/i18n). Personal words are teacher-authored
 * text shown verbatim, spoken with the student-facing language's voice.
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
  /** i18n dictionary key for the tile's label (and spoken text). */
  labelKey: StringKey;
  symbol: string;
  /** Tailwind tile tint. */
  tint: string;
}

// Calm, high-contrast tints drawn from the palette + default Tailwind scale.
const TILES: AACTile[] = [
  { word: "yes", labelKey: "aacYes", symbol: "👍", tint: "bg-sage-50 border-sage-200" },
  { word: "no", labelKey: "aacNo", symbol: "👎", tint: "bg-coral-soft/40 border-coral-soft" },
  { word: "more", labelKey: "aacMore", symbol: "➕", tint: "bg-sage-50 border-sage-200" },
  { word: "stop", labelKey: "aacStop", symbol: "✋", tint: "bg-coral-soft/40 border-coral-soft" },
  { word: "help", labelKey: "aacHelp", symbol: "🙋", tint: "bg-amber-50 border-amber-200" },
  { word: "break", labelKey: "aacBreak", symbol: "🧘", tint: "bg-sky-50 border-sky-200" },
  { word: "again", labelKey: "aacAgain", symbol: "🔁", tint: "bg-sky-50 border-sky-200" },
  { word: "done", labelKey: "aacDone", symbol: "✅", tint: "bg-sage-50 border-sage-200" },
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
  /**
   * Per-student fringe vocabulary (StudentProfile.aacWords). Rendered as
   * additional "My words" tiles that speak on tap.
   */
  extraWords?: string[];
}

export function AACBoard({
  open,
  onClose,
  onBreak,
  onAgain,
  onDone,
  volume = 1,
  extraWords,
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
    speak(label, { volume, lang: ttsLang() });
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

  const myWords = (extraWords ?? []).map((w) => w.trim()).filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("aacBoardAria")}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-3xl max-h-full overflow-y-auto rounded-tile bg-white p-6 shadow-card outline-none",
          !reduceMotion && "animate-softIn",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{t("aacBoardTitle")}</h2>
          <button
            onClick={onClose}
            aria-label={t("aacClose")}
            className="rounded-tile p-2 text-muted hover:bg-sage-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TILES.map((tile) => {
            const label = t(tile.labelKey);
            return (
              <button
                key={tile.word}
                data-aac-word={tile.word}
                onClick={() => handleTap(tile.word, label)}
                aria-label={label}
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
                <span className="text-base font-medium text-ink">{label}</span>
              </button>
            );
          })}
        </div>

        {myWords.length > 0 && (
          <div
            className="mt-6 border-t border-line pt-4"
            role="group"
            aria-label={t("aacMyWords")}
            data-aac-my-words
          >
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
              {t("aacMyWords")}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {myWords.map((word, i) => (
                <button
                  key={`${word}-${i}`}
                  data-aac-extra-word={word}
                  onClick={() => speak(word, { volume, lang: ttsLang() })}
                  aria-label={word}
                  className={cn(
                    "flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-tile border-2 p-4",
                    "border-dashed border-violet-200 bg-violet-50",
                    "shadow-tile transition-transform select-none",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500",
                    !reduceMotion && "hover:-translate-y-0.5",
                  )}
                >
                  <span className="text-2xl" aria-hidden="true">
                    💬
                  </span>
                  <span className="text-base font-medium text-ink break-words">
                    {word}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
