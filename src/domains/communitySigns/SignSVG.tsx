import { SignKind } from "./trials";

interface Props {
  kind: SignKind;
  size?: number;
}

/**
 * Inline SVG renderings of common community signs. Shapes and colors
 * track real-world signs (red octagon for stop, green for exit, etc.)
 * but are simplified for clarity. Aria-label gives the meaning so screen
 * readers and the eye-tracker fixation overlay both have something to
 * latch onto.
 */
export function SignSVG({ kind, size = 130 }: Props) {
  switch (kind) {
    case "stop":
      return <Stop size={size} />;
    case "exit":
      return <Exit size={size} />;
    case "restroom":
      return <Restroom size={size} />;
    case "walk":
      return <Walk size={size} />;
    case "dontWalk":
      return <DontWalk size={size} />;
    case "danger":
      return <Danger size={size} />;
  }
}

function Stop({ size }: { size: number }) {
  // Use coral-leaning red rather than full saturation, in keeping with the
  // calm palette. Still recognizable as STOP.
  const s = size;
  const c = s / 2;
  const r = s * 0.45;
  // 8 vertices for an octagon, rotated so flats are on top/bottom.
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 8) + (i * Math.PI) / 4;
    return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} role="img" aria-label="Stop sign">
      <polygon points={pts} fill="#C64A3A" stroke="#8C2E22" strokeWidth={3} />
      <text x={c} y={c + s * 0.06} textAnchor="middle" fontSize={s * 0.22} fontWeight={800} fill="white" letterSpacing="2">
        STOP
      </text>
    </svg>
  );
}

function Exit({ size }: { size: number }) {
  const s = size;
  return (
    <svg viewBox={`0 0 ${s} ${s * 0.6}`} width={s} height={s * 0.6} role="img" aria-label="Exit sign">
      <rect x={2} y={2} width={s - 4} height={s * 0.6 - 4} rx={6} fill="#3F7D4E" stroke="#235433" strokeWidth={2} />
      <text x={s / 2} y={s * 0.4} textAnchor="middle" fontSize={s * 0.22} fontWeight={800} fill="white" letterSpacing="3">
        EXIT
      </text>
    </svg>
  );
}

function Restroom({ size }: { size: number }) {
  const s = size;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} role="img" aria-label="Restroom sign">
      <rect x={4} y={4} width={s - 8} height={s - 8} rx={6} fill="#3D6BAA" stroke="#1F3F77" strokeWidth={2} />
      {/* simple person figure */}
      <circle cx={s * 0.35} cy={s * 0.32} r={s * 0.07} fill="white" />
      <path d={`M ${s * 0.28} ${s * 0.45} L ${s * 0.42} ${s * 0.45} L ${s * 0.4} ${s * 0.78} L ${s * 0.3} ${s * 0.78} Z`} fill="white" />
      {/* second figure with skirt */}
      <circle cx={s * 0.66} cy={s * 0.32} r={s * 0.07} fill="white" />
      <path d={`M ${s * 0.58} ${s * 0.45} L ${s * 0.74} ${s * 0.45} L ${s * 0.78} ${s * 0.78} L ${s * 0.54} ${s * 0.78} Z`} fill="white" />
    </svg>
  );
}

function Walk({ size }: { size: number }) {
  const s = size;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} role="img" aria-label="Walk signal">
      <rect x={4} y={4} width={s - 8} height={s - 8} rx={10} fill="#1F2937" />
      {/* walking-person glyph */}
      <g fill="#E6EFE3">
        <circle cx={s * 0.55} cy={s * 0.25} r={s * 0.07} />
        <path d={`M ${s * 0.45} ${s * 0.42} L ${s * 0.7} ${s * 0.42} L ${s * 0.62} ${s * 0.62} L ${s * 0.78} ${s * 0.78} L ${s * 0.7} ${s * 0.85} L ${s * 0.5} ${s * 0.65} L ${s * 0.4} ${s * 0.85} L ${s * 0.32} ${s * 0.78} L ${s * 0.42} ${s * 0.55} Z`} />
      </g>
    </svg>
  );
}

function DontWalk({ size }: { size: number }) {
  const s = size;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} role="img" aria-label="Do not walk signal">
      <rect x={4} y={4} width={s - 8} height={s - 8} rx={10} fill="#1F2937" />
      {/* hand glyph */}
      <g fill="#E8927C">
        <path d={`M ${s * 0.32} ${s * 0.7} L ${s * 0.32} ${s * 0.45} Q ${s * 0.32} ${s * 0.32} ${s * 0.42} ${s * 0.32} L ${s * 0.42} ${s * 0.55} L ${s * 0.46} ${s * 0.55} L ${s * 0.46} ${s * 0.28} Q ${s * 0.46} ${s * 0.18} ${s * 0.54} ${s * 0.18} Q ${s * 0.62} ${s * 0.18} ${s * 0.62} ${s * 0.28} L ${s * 0.62} ${s * 0.55} L ${s * 0.66} ${s * 0.55} L ${s * 0.66} ${s * 0.32} Q ${s * 0.66} ${s * 0.22} ${s * 0.74} ${s * 0.22} Q ${s * 0.82} ${s * 0.22} ${s * 0.82} ${s * 0.32} L ${s * 0.82} ${s * 0.7} Q ${s * 0.82} ${s * 0.85} ${s * 0.62} ${s * 0.85} L ${s * 0.5} ${s * 0.85} Q ${s * 0.32} ${s * 0.85} ${s * 0.32} ${s * 0.7} Z`} />
      </g>
    </svg>
  );
}

function Danger({ size }: { size: number }) {
  const s = size;
  // Equilateral triangle, point up, soft amber.
  const pts = `${s / 2},${s * 0.08} ${s * 0.92},${s * 0.88} ${s * 0.08},${s * 0.88}`;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} role="img" aria-label="Danger sign">
      <polygon points={pts} fill="#E0B14B" stroke="#7E5A14" strokeWidth={3} />
      <text x={s / 2} y={s * 0.7} textAnchor="middle" fontSize={s * 0.45} fontWeight={900} fill="#1F2937">
        !
      </text>
    </svg>
  );
}
