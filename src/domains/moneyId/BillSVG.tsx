interface Props {
  dollars: 1 | 5;
  size?: number;
}

export function BillSVG({ dollars, size = 140 }: Props) {
  const w = size;
  const h = size * 0.55;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`${dollars} dollar bill`}
    >
      <rect
        x={2}
        y={2}
        width={w - 4}
        height={h - 4}
        rx={6}
        fill="#E6EFE3"
        stroke="#5C8479"
        strokeWidth={2}
      />
      <rect
        x={8}
        y={8}
        width={w - 16}
        height={h - 16}
        rx={4}
        fill="none"
        stroke="#5C8479"
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.6}
      />
      <circle
        cx={w / 2}
        cy={h / 2}
        r={h * 0.28}
        fill="white"
        stroke="#5C8479"
        strokeWidth={1.5}
      />
      <text
        x={w / 2}
        y={h / 2 + h * 0.05}
        textAnchor="middle"
        fontSize={h * 0.32}
        fontWeight={800}
        fill="#1F2937"
      >
        ${dollars}
      </text>
      <text
        x={14}
        y={h - 12}
        fontSize={h * 0.14}
        fill="#1F2937"
        opacity={0.7}
        fontWeight={700}
      >
        {dollars}
      </text>
      <text
        x={w - 14}
        y={20}
        textAnchor="end"
        fontSize={h * 0.14}
        fill="#1F2937"
        opacity={0.7}
        fontWeight={700}
      >
        {dollars}
      </text>
    </svg>
  );
}
