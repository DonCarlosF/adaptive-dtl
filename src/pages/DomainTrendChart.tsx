import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  data: Array<{ n: number; accuracy: number }>;
}

/**
 * Recharts trend line, isolated in its own module so it can be lazy-
 * loaded. Pulling Recharts into a separate chunk keeps the initial
 * dashboard payload off the critical path — see BUNDLE.md.
 *
 * Default export so it composes neatly with `React.lazy(() => import(...))`.
 */
export default function DomainTrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <CartesianGrid stroke="#E6E1D8" vertical={false} />
        <XAxis
          dataKey="n"
          stroke="#9AA1A8"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          stroke="#9AA1A8"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #E6E1D8" }}
          formatter={(v: number) => [`${v}%`, "accuracy"]}
          labelFormatter={(l) => `Session ${l}`}
        />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="#5C8479"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#5C8479" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
