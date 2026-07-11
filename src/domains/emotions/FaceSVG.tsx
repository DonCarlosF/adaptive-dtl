import { EmotionKind } from "./trials";

interface Props {
  kind: EmotionKind;
  /** Accessible name — the emotion word, e.g. "happy". */
  label: string;
  size?: number;
}

/**
 * Simple, friendly inline SVG faces — one per emotion, in the same
 * hand-drawn spirit as the moneyId/communitySigns art. Every expression
 * is built from at least two distinct cues (mouth + eyes/brows, plus an
 * extra marker like a tear or sparkles) so no single feature carries the
 * whole meaning. Warm neutral skin tone from the app's calm palette;
 * accents reuse hexes already used by the sign SVGs.
 */
export function FaceSVG({ kind, label, size = 120 }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      {/* head */}
      <circle cx={50} cy={50} r={40} fill="#F6E7CE" stroke="#C9A56E" strokeWidth={2.5} />
      <Features kind={kind} />
    </svg>
  );
}

const INK = "#1F2937";
const CHEEK = "#F5C5B8"; // coral-soft
const TEAR = "#3D6BAA"; // restroom-sign blue
const SPARK = "#E0B14B"; // danger-sign amber

function Features({ kind }: { kind: EmotionKind }) {
  switch (kind) {
    case "happy":
      return (
        <g>
          <circle cx={36} cy={42} r={4} fill={INK} />
          <circle cx={64} cy={42} r={4} fill={INK} />
          <path d="M 32 56 Q 50 74 68 56" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <circle cx={26} cy={54} r={5} fill={CHEEK} opacity={0.8} />
          <circle cx={74} cy={54} r={5} fill={CHEEK} opacity={0.8} />
        </g>
      );
    case "sad":
      return (
        <g>
          <circle cx={36} cy={42} r={4} fill={INK} />
          <circle cx={64} cy={42} r={4} fill={INK} />
          {/* brows tilted up toward the middle */}
          <path d="M 28 34 Q 34 30 42 33" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M 58 33 Q 66 30 72 34" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M 34 68 Q 50 56 66 68" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          {/* tear */}
          <ellipse cx={66} cy={54} rx={3.5} ry={5.5} fill={TEAR} />
        </g>
      );
    case "angry":
      return (
        <g>
          {/* brows slanted down toward the middle */}
          <path d="M 27 32 L 43 39" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <path d="M 73 32 L 57 39" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <circle cx={37} cy={45} r={4} fill={INK} />
          <circle cx={63} cy={45} r={4} fill={INK} />
          <path d="M 36 68 Q 50 60 64 68" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </g>
      );
    case "scared":
      return (
        <g>
          {/* high, worried brows */}
          <path d="M 28 29 Q 36 24 44 28" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M 56 28 Q 64 24 72 29" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          {/* wide eyes with small pupils */}
          <circle cx={36} cy={42} r={7} fill="white" stroke={INK} strokeWidth={2.5} />
          <circle cx={64} cy={42} r={7} fill="white" stroke={INK} strokeWidth={2.5} />
          <circle cx={36} cy={43} r={2.5} fill={INK} />
          <circle cx={64} cy={43} r={2.5} fill={INK} />
          {/* wavy, trembling mouth */}
          <path d="M 34 65 q 4 -5 8 0 q 4 5 8 0 q 4 -5 8 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      );
    case "surprised":
      return (
        <g>
          {/* round raised brows */}
          <path d="M 29 30 Q 36 25 43 30" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M 57 30 Q 64 25 71 30" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <circle cx={36} cy={42} r={5} fill={INK} />
          <circle cx={64} cy={42} r={5} fill={INK} />
          {/* big open O mouth */}
          <ellipse cx={50} cy={65} rx={8} ry={10} fill="white" stroke={INK} strokeWidth={3.5} />
        </g>
      );
    case "tired":
      return (
        <g>
          {/* heavy lids drooping down */}
          <path d="M 29 42 Q 36 48 43 42" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M 57 42 Q 64 48 71 42" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
          {/* small flat mouth */}
          <path d="M 40 66 L 60 66" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
          {/* sleepy z z */}
          <text x={76} y={22} fontSize={13} fontWeight={700} fill="#6B7280" fontStyle="italic">
            z
          </text>
          <text x={85} y={13} fontSize={9} fontWeight={700} fill="#6B7280" fontStyle="italic">
            z
          </text>
        </g>
      );
    case "calm":
      return (
        <g>
          {/* softly closed eyes */}
          <path d="M 30 43 Q 36 47 42 43" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M 58 43 Q 64 47 70 43" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          {/* gentle small smile */}
          <path d="M 39 61 Q 50 68 61 61" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      );
    case "excited":
      return (
        <g>
          {/* lifted brows */}
          <path d="M 29 31 Q 36 27 43 31" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M 57 31 Q 64 27 71 31" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <circle cx={36} cy={42} r={4.5} fill={INK} />
          <circle cx={64} cy={42} r={4.5} fill={INK} />
          {/* big open smiling mouth */}
          <path d="M 32 57 Q 50 79 68 57 Z" fill={INK} />
          <path d="M 40 64 Q 50 71 60 64 Q 50 68 40 64 Z" fill={CHEEK} />
          {/* sparkles */}
          <path d="M 18 26 l 2.2 4.4 l 4.4 2.2 l -4.4 2.2 l -2.2 4.4 l -2.2 -4.4 l -4.4 -2.2 l 4.4 -2.2 Z" fill={SPARK} />
          <path d="M 82 24 l 1.8 3.6 l 3.6 1.8 l -3.6 1.8 l -1.8 3.6 l -1.8 -3.6 l -3.6 -1.8 l 3.6 -1.8 Z" fill={SPARK} />
        </g>
      );
  }
}
