import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Sparkles, Eye, Play, Pause } from "lucide-react";
import {
  AdaptationEvent,
  DOMAIN_LABELS,
  GazeTracePoint,
  SessionRecord,
  TrialResult,
} from "@/engine/types";

interface Props {
  session: SessionRecord;
  onClose: () => void;
}

/**
 * Session replay. Shows the trial timeline, lets the teacher scrub
 * through, and overlays the (simulated) gaze trace if one was recorded.
 *
 * The "show your work" view: it proves the adaptation pipeline runs on
 * real recorded inputs even when the camera input is simulated.
 */
export function SessionReplay({ session, onClose }: Props) {
  const trials = session.trials;
  const [trialIndex, setTrialIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    playTimer.current = window.setInterval(() => {
      setTrialIndex((i) => {
        if (i >= trials.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1200);
    return () => {
      if (playTimer.current != null) window.clearInterval(playTimer.current);
    };
  }, [playing, trials.length]);

  const trial = trials[trialIndex];
  const traceForTrial = useMemo(
    () => (session.gazeTrace ?? []).filter((p) => p.trialIndex === trialIndex),
    [session.gazeTrace, trialIndex],
  );
  const adaptationsAtOrBefore = useMemo(
    () => session.adaptations.filter((a) => a.trialIndex <= trialIndex),
    [session.adaptations, trialIndex],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Replay · ${DOMAIN_LABELS[session.domain]} · ${new Date(
        session.startedAt,
      ).toLocaleString()}`}
      widthClass="max-w-3xl"
    >
      <div className="space-y-5">
        <Summary session={session} />

        <Scrubber
          trialIndex={trialIndex}
          total={trials.length}
          onChange={setTrialIndex}
        />

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted">
            Trial {trialIndex + 1} of {trials.length}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause" : "Play"}
          </Button>
        </div>

        {trial && (
          <TrialPanel
            trial={trial}
            adaptations={adaptationsAtOrBefore}
          />
        )}

        <GazeTraceCanvas
          trace={traceForTrial}
          gazeAvailable={!!session.gazeTrace?.length}
        />

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

function Summary({ session }: { session: SessionRecord }) {
  const correct = session.trials.filter((t) => t.correct).length;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-ink font-medium">
        {Math.round(session.accuracy * 100)}% · {correct}/{session.trials.length}
      </span>
      {session.adaptations.length > 0 && (
        <span className="inline-flex items-center gap-1 text-sage-600">
          <Sparkles size={12} />
          {session.adaptations.length} adaptations
        </span>
      )}
      {session.aiGenerated && (
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-sage-50 text-sage-600 border border-sage-100">
          AI activities
        </span>
      )}
      {session.gazeTrace && session.gazeTrace.length > 0 && (
        <span className="inline-flex items-center gap-1 text-muted text-xs">
          <Eye size={12} />
          {session.gazeTrace.length} simulated gaze samples
        </span>
      )}
      {session.endedEarly && (
        <span className="text-coral text-xs">ended early</span>
      )}
    </div>
  );
}

function Scrubber({
  trialIndex,
  total,
  onChange,
}: {
  trialIndex: number;
  total: number;
  onChange: (i: number) => void;
}) {
  if (total === 0) return null;
  return (
    <input
      type="range"
      min={0}
      max={total - 1}
      value={trialIndex}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-sage-500"
      aria-label="Scrub through trials"
    />
  );
}

function TrialPanel({
  trial,
  adaptations,
}: {
  trial: TrialResult;
  adaptations: AdaptationEvent[];
}) {
  return (
    <div className="bg-canvas border border-line rounded-tile p-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Result">
          <span className={trial.correct ? "text-sage-600" : "text-coral"}>
            {trial.correct ? "Correct" : "Incorrect"}
          </span>
        </Field>
        <Field label="Choices shown">
          <span>{trial.numChoices}</span>
        </Field>
        <Field label="Response time">
          <span>{(trial.responseTimeMs / 1000).toFixed(2)}s</span>
        </Field>
        <Field label="Errorless highlight">
          <span>{trial.errorlessHighlight ? "On" : "Off"}</span>
        </Field>
      </div>
      {adaptations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="text-xs font-medium text-ink mb-1.5">
            Adaptations through this trial
          </div>
          <ul className="space-y-1">
            {adaptations.map((a, i) => (
              <li
                key={i}
                className="text-xs text-sage-600 inline-flex items-center gap-1.5"
              >
                <Sparkles size={11} />
                {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

function GazeTraceCanvas({
  trace,
  gazeAvailable,
}: {
  trace: GazeTracePoint[];
  gazeAvailable: boolean;
}) {
  // Fixed-size SVG; scale viewport-coordinate trace into the box.
  const W = 640;
  const H = 240;
  if (!gazeAvailable) {
    return (
      <div className="text-xs text-muted text-center bg-canvas border border-line rounded-tile py-6">
        No gaze trace recorded for this session.
      </div>
    );
  }

  if (trace.length === 0) {
    return (
      <div className="text-xs text-muted text-center bg-canvas border border-line rounded-tile py-6">
        Eye tracking was on, but no samples landed in this trial's window.
      </div>
    );
  }

  // Find viewport extents from the trace itself.
  const xs = trace.map((p) => p.x);
  const ys = trace.map((p) => p.y);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(window.innerWidth, ...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(window.innerHeight, ...ys);
  const sx = W / (maxX - minX || 1);
  const sy = H / (maxY - minY || 1);
  const scale = Math.min(sx, sy);
  const off = (n: number, mn: number) => (n - mn) * scale;

  // Path
  const d = trace
    .map((p, i) =>
      `${i === 0 ? "M" : "L"} ${off(p.x, minX).toFixed(1)} ${off(p.y, minY).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div>
      <div className="text-xs text-muted mb-1.5 inline-flex items-center gap-1.5">
        <Eye size={12} />
        Simulated gaze trace · {trace.length} samples
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="bg-canvas border border-line rounded-tile"
        role="img"
        aria-label="Gaze trace for the selected trial"
      >
        <rect x={0} y={0} width={W} height={H} fill="#FAF7F2" />
        {/* viewport bounds */}
        <rect
          x={off(0, minX)}
          y={off(0, minY)}
          width={off(window.innerWidth, minX) - off(0, minX)}
          height={off(window.innerHeight, minY) - off(0, minY)}
          fill="none"
          stroke="#E6E1D8"
          strokeWidth={1}
        />
        <path d={d} fill="none" stroke="#7BA098" strokeWidth={1.2} opacity={0.6} />
        {trace.map((p, i) => (
          <circle
            key={i}
            cx={off(p.x, minX)}
            cy={off(p.y, minY)}
            r={p.offScreen ? 2.4 : 1.6}
            fill={p.offScreen ? "#E8927C" : "#5C8479"}
            opacity={0.7}
          />
        ))}
      </svg>
    </div>
  );
}
