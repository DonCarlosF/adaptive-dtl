/**
 * TeacherMonitor — live co-presence view.
 *
 * A teacher enters the join code shown on the student's device and watches a
 * real-time mirror of the session: progress, live accuracy, a gaze dot, and
 * the latest adaptation. Steering buttons send control messages back to the
 * student device.
 *
 * Renders a graceful message when the cloud backend isn't configured, since
 * realtime requires the relay.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, Coffee, Minus, Square, Sparkles } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ProgressRing } from "@/components/ProgressRing";
import { DOMAIN_LABELS } from "@/engine/types";
import { isCloudEnabled } from "@/api/client";
import { normalizeJoinCode } from "@/realtime/protocol";
import { useSessionMonitor } from "@/realtime/useSessionMonitor";

interface Props {
  onBack: () => void;
  /** Optional code to pre-fill (e.g. deep link / paste from teacher chat). */
  seedCode?: string | null;
}

export function TeacherMonitor({ onBack, seedCode }: Props) {
  const [draft, setDraft] = useState(seedCode ? normalizeJoinCode(seedCode) : "");
  // Committed code drives the connection; editing the draft doesn't reconnect.
  const [code, setCode] = useState<string | null>(
    seedCode ? normalizeJoinCode(seedCode) : null,
  );

  const cloud = isCloudEnabled();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={18} /> Back
          </button>
          <h1 className="text-lg font-semibold tracking-tight">Live Monitor</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {!cloud ? (
          <Card className="p-8 text-center">
            <p className="text-muted">
              Live monitoring needs the cloud backend. Set{" "}
              <code className="text-ink">VITE_API_URL</code> and sign in to use
              co-presence.
            </p>
          </Card>
        ) : code ? (
          <MonitorView code={code} onChangeCode={() => setCode(null)} />
        ) : (
          <CodeEntry
            draft={draft}
            onDraft={(v) => setDraft(normalizeJoinCode(v))}
            onJoin={() => draft && setCode(draft)}
          />
        )}
      </main>
    </div>
  );
}

function CodeEntry({
  draft,
  onDraft,
  onJoin,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onJoin: () => void;
}) {
  return (
    <Card className="p-8 max-w-md mx-auto">
      <h2 className="text-xl font-semibold text-ink mb-1">Watch a session</h2>
      <p className="text-muted text-sm mb-5">
        Enter the code shown on the student's screen.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onJoin();
        }}
        className="flex flex-col gap-3"
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          maxLength={6}
          placeholder="ABC123"
          aria-label="Join code"
          className="h-14 text-center text-2xl tracking-[0.4em] font-mono uppercase rounded-tile border border-line focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
        />
        <Button type="submit" size="lg" disabled={draft.length < 6}>
          Connect
        </Button>
      </form>
    </Card>
  );
}

function MonitorView({
  code,
  onChangeCode,
}: {
  code: string;
  onChangeCode: () => void;
}) {
  const { state, status, sendControl } = useSessionMonitor(code);
  const { snapshot, studentConnected, error, accuracy } = state;

  const statusLabel = useMemo(() => {
    if (error) return error;
    if (status === "connecting") return "Connecting…";
    if (status === "closed") return "Reconnecting…";
    if (!studentConnected) return "Waiting for the student device…";
    return "Live";
  }, [error, status, studentConnected]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              "inline-block w-2 h-2 rounded-full " +
              (studentConnected ? "bg-sage" : "bg-line")
            }
            aria-hidden
          />
          <span className={studentConnected ? "text-ink" : "text-muted"}>
            {statusLabel}
          </span>
          <span className="text-muted">
            · code <span className="font-mono text-ink">{code}</span>
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onChangeCode}>
          Change code
        </Button>
      </div>

      <Card className="p-6">
        {snapshot ? (
          <div className="flex items-center gap-6">
            <ProgressRing
              progress={snapshot.trialIndex / snapshot.plannedTrials}
              size={88}
              stroke={7}
            >
              <span className="text-sm font-medium text-ink">
                {snapshot.trialIndex}/{snapshot.plannedTrials}
              </span>
            </ProgressRing>
            <div className="flex-1">
              <div className="font-semibold text-ink">
                {DOMAIN_LABELS[snapshot.domain]}
              </div>
              <div className="text-sm text-muted">
                {snapshot.numChoices} choices
                {snapshot.errorlessHighlight && " · errorless"} ·{" "}
                {phaseLabel(snapshot.phase)}
              </div>
              <div className="mt-2 text-sm">
                <span className="text-muted">Accuracy </span>
                <span className="text-ink font-medium">
                  {snapshot.trialIndex > 0
                    ? `${Math.round(accuracy * 100)}%`
                    : "—"}
                </span>
                <span className="text-muted">
                  {" "}
                  ({snapshot.correct}/{snapshot.trialIndex} correct)
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm">No session data yet.</p>
        )}
      </Card>

      {/* Live gaze mirror — only when the student is broadcasting gaze. */}
      {snapshot?.gaze && <GazeMirror gaze={snapshot.gaze} />}

      {snapshot?.lastAdaptation && (
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-tile bg-sage-50 border border-sage-100 text-sage-600 text-sm">
          <Sparkles size={14} />
          <span>{snapshot.lastAdaptation.reason}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={!studentConnected}
          onClick={() => sendControl({ control: "force-break" })}
        >
          <Coffee size={16} /> Take a break
        </Button>
        <Button
          variant="secondary"
          disabled={!studentConnected || !snapshot || snapshot.numChoices <= 2}
          onClick={() =>
            snapshot &&
            sendControl({
              control: "set-num-choices",
              numChoices: Math.max(2, snapshot.numChoices - 1) as 2 | 3,
            })
          }
        >
          <Minus size={16} /> Make easier
        </Button>
        <Button
          variant="danger"
          disabled={!studentConnected}
          onClick={() => sendControl({ control: "end-session" })}
        >
          <Square size={16} /> End session
        </Button>
      </div>
    </div>
  );
}

function GazeMirror({
  gaze,
}: {
  gaze: { x: number; y: number; confidence: number; vw: number; vh: number };
}) {
  // Scale the student's viewport-space gaze into a fixed-aspect preview box.
  const PREVIEW_W = 320;
  const aspect = gaze.vh / gaze.vw;
  const previewH = Math.round(PREVIEW_W * aspect);
  const left = (gaze.x / gaze.vw) * PREVIEW_W;
  const top = (gaze.y / gaze.vh) * previewH;
  const onScreen = gaze.x >= 0 && gaze.x <= gaze.vw && gaze.y >= 0 && gaze.y <= gaze.vh;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink">Gaze</span>
        <span className="text-[10px] uppercase tracking-wider text-muted">
          Simulated · {onScreen ? "on screen" : "off screen"}
        </span>
      </div>
      <div
        className="relative bg-canvas border border-line rounded-tile mx-auto overflow-hidden"
        style={{ width: PREVIEW_W, height: previewH }}
        aria-label="Live gaze preview"
      >
        {onScreen && (
          <div
            className="absolute rounded-full ring-2 ring-sage-500/60"
            style={{
              left: left - 8,
              top: top - 8,
              width: 16,
              height: 16,
              backgroundColor: "#7BA098",
              opacity: 0.4 + gaze.confidence * 0.6,
              transition: "left 120ms linear, top 120ms linear",
            }}
          />
        )}
      </div>
    </Card>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "loading":
      return "getting ready";
    case "trial":
      return "in a trial";
    case "feedback":
      return "feedback";
    case "break":
      return "on a break";
    case "done":
      return "finished";
    default:
      return phase;
  }
}
