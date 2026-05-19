import { X } from "lucide-react";
import { useLongPress } from "@/hooks/useLongPress";
import { ProgressRing } from "@/components/ProgressRing";
import { timing } from "@/lib/tokens";

interface Props {
  onExit: () => void;
}

/**
 * 3-second hold to exit. Easy for an adult finger, prevents the
 * student from leaving the activity by accident.
 */
export function LongPressExit({ onExit }: Props) {
  const { progress, active, bind } = useLongPress({
    durationMs: timing.longPressMs,
    onComplete: onExit,
  });

  return (
    <button
      aria-label="Hold to exit"
      title="Hold to exit"
      className="fixed top-4 right-4 z-50 rounded-full bg-white/80 backdrop-blur border border-line p-1 select-none touch-none"
      {...bind}
    >
      <ProgressRing progress={progress} size={56} stroke={5}>
        <span
          className="text-muted"
          style={{ opacity: active ? 0.4 : 0.7 }}
        >
          <X size={22} />
        </span>
      </ProgressRing>
    </button>
  );
}
