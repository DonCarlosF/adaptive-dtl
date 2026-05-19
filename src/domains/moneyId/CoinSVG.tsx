interface Props {
  cents: 1 | 5 | 10 | 25;
  /** Size in px (square). */
  size?: number;
}

const FACE: Record<number, { ring: string; fill: string; rim: string; sizeMul: number; label: string; sub: string }> = {
  1: {
    ring: "#8C5A3C",
    fill: "#C68A66",
    rim: "#6E4226",
    sizeMul: 0.85,
    label: "1¢",
    sub: "PENNY",
  },
  5: {
    ring: "#9AA1A8",
    fill: "#C7CCD1",
    rim: "#6F757B",
    sizeMul: 0.92,
    label: "5¢",
    sub: "NICKEL",
  },
  10: {
    ring: "#9AA1A8",
    fill: "#C7CCD1",
    rim: "#6F757B",
    sizeMul: 0.78,
    label: "10¢",
    sub: "DIME",
  },
  25: {
    ring: "#9AA1A8",
    fill: "#C7CCD1",
    rim: "#6F757B",
    sizeMul: 1.0,
    label: "25¢",
    sub: "QUARTER",
  },
};

/**
 * Stylized, labeled coin. Not photorealistic on purpose — kids who are
 * still learning denominations do better with clean, high-contrast
 * representations than with worn real-world coin photos.
 */
export function CoinSVG({ cents, size = 120 }: Props) {
  const f = FACE[cents];
  const r = (size / 2) * f.sizeMul;
  const c = size / 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`${f.sub} coin, ${f.label}`}
    >
      <circle cx={c} cy={c} r={r} fill={f.fill} stroke={f.rim} strokeWidth={3} />
      <circle
        cx={c}
        cy={c}
        r={r - 6}
        fill="none"
        stroke={f.ring}
        strokeWidth={1.5}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      <text
        x={c}
        y={c - 4}
        textAnchor="middle"
        fontSize={r * 0.55}
        fontWeight={700}
        fill="#1F2937"
      >
        {f.label}
      </text>
      <text
        x={c}
        y={c + r * 0.45}
        textAnchor="middle"
        fontSize={r * 0.22}
        letterSpacing="2"
        fill="#1F2937"
        opacity={0.7}
      >
        {f.sub}
      </text>
    </svg>
  );
}
