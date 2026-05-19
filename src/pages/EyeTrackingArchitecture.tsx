import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Collapsed-by-default architecture panel for the eye-tracking pipeline.
 *
 * The point of this panel: turn what would otherwise be invisible scaffolding
 * (stub interfaces, simulated data) into a visible engineering decision the
 * teacher and any reviewer can read. The diagram is an inline SVG — no
 * dependency, no flicker, fits the calm palette.
 */
export function EyeTrackingArchitecturePanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line rounded-xl bg-sage-50/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-ink hover:bg-sage-50 rounded-xl transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        Architecture: Eye Tracking
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 animate-softIn">
          <p className="text-sm text-ink/80 leading-relaxed">
            This app is wired for eye tracking, but the current build uses a{" "}
            <em>simulated gaze stream</em> rather than a real camera. The
            entire downstream pipeline — gaze store, gaze rules, adaptive
            engine, session UI — runs against the simulator and produces real
            adaptations during a session. Real WebGazer.js integration is the
            next milestone; the seam is small and labeled.
          </p>

          <DataFlowDiagram />

          <div className="text-xs text-muted leading-relaxed">
            <div className="font-semibold text-ink mb-1.5">
              Files that change to wire up real cameras:
            </div>
            <ul className="space-y-1 list-disc pl-5">
              <li>
                <code className="text-ink">
                  src/eyetracking/webgazerWrapper.ts
                </code>{" "}
                — load the WebGazer script, initialize the model, return
                ready-state.
              </li>
              <li>
                <code className="text-ink">
                  src/eyetracking/calibration.tsx
                </code>{" "}
                — replace the mock per-dot tap with WebGazer's training-point
                recorder.
              </li>
              <li>
                <code className="text-ink">src/eyetracking/gazeStore.ts</code>{" "}
                — replace the synthetic stream with throttled real predictions.
              </li>
            </ul>
          </div>

          <div className="text-xs text-muted">
            See <code className="text-ink">EYE_TRACKING.md</code> for the full
            architecture write-up and rollout plan.
          </div>
        </div>
      )}
    </div>
  );
}

function DataFlowDiagram() {
  // Five nodes in a row. Camera and WebGazer edges are dashed (planned);
  // the rest are solid (built). Boxes are rounded rectangles; arrows are
  // simple chevron strokes.
  const W = 720;
  const H = 150;
  const nodeY = 56;
  const nodeH = 38;
  const nodeWs = [86, 96, 96, 96, 96, 110];
  const labels = [
    "Camera",
    "WebGazer",
    "gazeStore",
    "gazeRules",
    "adaptiveEngine",
    "Session UI",
  ];
  const built = [false, false, true, true, true, true];

  // Compute x positions evenly.
  const totalNodeW = nodeWs.reduce((a, b) => a + b, 0);
  const gap = (W - totalNodeW - 20) / (nodeWs.length - 1);
  const xs: number[] = [];
  let cursor = 10;
  for (const w of nodeWs) {
    xs.push(cursor);
    cursor += w + gap;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Data flow diagram: Camera → WebGazer → gazeStore → gazeRules → adaptiveEngine → Session UI"
        className="font-sans"
      >
        {/* Edges first so they sit under nodes */}
        {labels.slice(0, -1).map((_, i) => {
          const x1 = xs[i] + nodeWs[i];
          const x2 = xs[i + 1];
          const y = nodeY + nodeH / 2;
          // Edge is dashed when either side is "not built" (Camera→WebGazer→gazeStore boundary).
          const dashed = !built[i] || !built[i + 1];
          return (
            <g key={`e-${i}`}>
              <line
                x1={x1 + 4}
                y1={y}
                x2={x2 - 8}
                y2={y}
                stroke={dashed ? "#9AA1A8" : "#5C8479"}
                strokeWidth={1.5}
                strokeDasharray={dashed ? "4 4" : undefined}
              />
              {/* arrowhead */}
              <polygon
                points={`${x2 - 8},${y - 4} ${x2 - 2},${y} ${x2 - 8},${y + 4}`}
                fill={dashed ? "#9AA1A8" : "#5C8479"}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {labels.map((label, i) => {
          const x = xs[i];
          const w = nodeWs[i];
          const isBuilt = built[i];
          return (
            <g key={`n-${i}`}>
              <rect
                x={x}
                y={nodeY}
                width={w}
                height={nodeH}
                rx={10}
                fill={isBuilt ? "#FFFFFF" : "#F4F1EA"}
                stroke={isBuilt ? "#7BA098" : "#BFC6CC"}
                strokeWidth={isBuilt ? 1.5 : 1}
                strokeDasharray={isBuilt ? undefined : "3 3"}
              />
              <text
                x={x + w / 2}
                y={nodeY + nodeH / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={isBuilt ? "#1F2937" : "#6B7280"}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(10, ${H - 22})`}>
          <line x1={0} y1={6} x2={20} y2={6} stroke="#5C8479" strokeWidth={1.5} />
          <text x={26} y={10} fontSize={11} fill="#1F2937">
            Built (runs against simulated gaze today)
          </text>
          <line
            x1={290}
            y1={6}
            x2={310}
            y2={6}
            stroke="#9AA1A8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <text x={316} y={10} fontSize={11} fill="#6B7280">
            Not yet implemented (camera + WebGazer)
          </text>
        </g>
      </svg>
    </div>
  );
}
