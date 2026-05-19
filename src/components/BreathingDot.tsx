interface Props {
  size?: number;
  color?: string;
}

/** Slow, even pulse used for break/regulation screens. */
export function BreathingDot({ size = 96, color = "#7BA098" }: Props) {
  return (
    <div
      className="rounded-full animate-breathe"
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
