import { ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/a11y/usePrefersReducedMotion";

interface Props {
  show: boolean;
  /** When true (low-stim), suppress the icon and only flash a soft glow. */
  lowStim?: boolean;
}

/**
 * Brief positive feedback after a correct trial. Fades in, holds, fades
 * out over ~2 seconds. In low-stim mode the icon is suppressed and we
 * just dim the screen slightly with a sage wash — no celebration animation,
 * which can be overwhelming for some students.
 */
export function Reinforcer({ show, lowStim = false }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  if (!show) return null;
  return (
    <div
      // a11y: skip the fade animation under prefers-reduced-motion; the
      // brief wash still appears, just without the scale/opacity transition.
      className={cn(
        "pointer-events-none fixed inset-0 z-40 flex items-center justify-center",
        !reduceMotion && "animate-fadeInOut",
      )}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: lowStim ? "#7BA09812" : "#7BA09820" }}
      />
      {!lowStim && (
        <div className="relative bg-white rounded-full p-8 shadow-card border border-sage-100">
          <ThumbsUp size={64} className="text-sage" strokeWidth={2} />
        </div>
      )}
    </div>
  );
}
