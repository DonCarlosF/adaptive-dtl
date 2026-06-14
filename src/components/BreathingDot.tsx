import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/a11y/usePrefersReducedMotion";

interface Props {
  size?: number;
  color?: string;
}

/**
 * Slow, even pulse used for break/regulation screens.
 *
 * a11y: the breathing animation is gated on `prefers-reduced-motion`. When
 * the user opts out of motion we render a calm static dot instead so the
 * regulation screen never becomes a source of motion discomfort.
 */
export function BreathingDot({ size = 96, color = "#7BA098" }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <div
      className={cn("rounded-full", !reduceMotion && "animate-breathe")}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 0 12px ${color}22`,
      }}
      aria-hidden
    />
  );
}
