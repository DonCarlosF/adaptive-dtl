interface Props {
  /** Hour on the face, 1–12. */
  hour: number;
  /** Minutes past the hour — the domain only uses 0 and 30. */
  minutes: number;
  /** Accessible name, e.g. "3 o'clock". */
  label: string;
  size?: number;
}

/**
 * Inline SVG analog clock face in the app's calm palette. The hour hand
 * advances half a step at half past (as a real clock does) so students
 * learn the true hand geometry, not a simplified one. Numerals on every
 * hour keep it readable at tile size (~140px).
 */
export function ClockSVG({ hour, minutes, label, size = 140 }: Props) {
  const s = size;
  const c = s / 2;
  const r = s * 0.46;

  // 0° = 12 o'clock, clockwise.
  const point = (angleDeg: number, len: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: c + len * Math.sin(a), y: c - len * Math.cos(a) };
  };

  const minuteAngle = minutes * 6;
  const hourAngle = (hour % 12) * 30 + minutes * 0.5;
  const hourTip = point(hourAngle, r * 0.48);
  const minuteTip = point(minuteAngle, r * 0.72);

  const numerals = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const p = point(n * 30, r * 0.78);
    return (
      <text
        key={n}
        x={p.x}
        y={p.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={s * 0.095}
        fontWeight={600}
        fill="#1F2937"
      >
        {n}
      </text>
    );
  });

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const outer = point(i * 30, r * 0.96);
    const inner = point(i * 30, r * 0.89);
    return (
      <line
        key={i}
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        stroke="#6B7280"
        strokeWidth={s * 0.012}
        strokeLinecap="round"
      />
    );
  });

  return (
    <svg
      viewBox={`0 0 ${s} ${s}`}
      width={s}
      height={s}
      role="img"
      aria-label={label}
    >
      {/* face */}
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="white"
        stroke="#446A60"
        strokeWidth={s * 0.03}
      />
      {ticks}
      {numerals}
      {/* hour hand: short and thick */}
      <line
        x1={c}
        y1={c}
        x2={hourTip.x}
        y2={hourTip.y}
        stroke="#1F2937"
        strokeWidth={s * 0.045}
        strokeLinecap="round"
      />
      {/* minute hand: long and slimmer, sage to tell it apart */}
      <line
        x1={c}
        y1={c}
        x2={minuteTip.x}
        y2={minuteTip.y}
        stroke="#446A60"
        strokeWidth={s * 0.028}
        strokeLinecap="round"
      />
      {/* center pin */}
      <circle cx={c} cy={c} r={s * 0.032} fill="#E8927C" />
    </svg>
  );
}
