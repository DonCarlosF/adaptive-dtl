import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Eye,
  KeyRound,
  Sparkles,
  Loader2,
  Check,
  Accessibility,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Toast } from "@/components/Toast";
import { CalibrationOverlay } from "@/eyetracking/calibration";
import { settingsRepo } from "@/db/settingsRepo";
import { studentRepo } from "@/db/studentRepo";
import { AppSettings } from "@/db/schema";
import { DomainId, DOMAIN_LABELS, StudentProfile } from "@/engine/types";
import { requestAIGeneration } from "@/ai/activityGenerator";
import { describeError } from "@/ai/anthropicErrors";
import { EyeTrackingArchitecturePanel } from "./EyeTrackingArchitecture";

interface Props {
  onBack: () => void;
}

const DOMAINS: DomainId[] = ["sightWords", "moneyId", "communitySigns"];

type GenStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; cached: boolean; count: number; at: number }
  | { kind: "error"; message: string };

export function Settings({ onBack }: Props) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [showCal, setShowCal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<Record<DomainId, GenStatus>>({
    sightWords: { kind: "idle" },
    moneyId: { kind: "idle" },
    communitySigns: { kind: "idle" },
  });

  useEffect(() => {
    settingsRepo.get().then(setS);
    studentRepo.list().then((rows) => {
      setStudents(rows);
      if (rows.length > 0) setSelectedStudentId(rows[0].id);
    });
  }, []);

  const update = async (patch: Partial<Omit<AppSettings, "id">>) => {
    const next = await settingsRepo.patch(patch);
    setS(next);
  };

  const generate = async (domain: DomainId) => {
    if (!s) return;
    const student = students.find((x) => x.id === selectedStudentId);
    if (!student) {
      setToast("Add or select a student first.");
      return;
    }
    if (!s.apiKey.trim()) {
      setToast("Add an Anthropic API key in this panel first.");
      return;
    }
    setGenStatus((g) => ({ ...g, [domain]: { kind: "running" } }));
    const out = await requestAIGeneration(domain, student, s.apiKey.trim(), 8);
    if (!out.ok) {
      const msg =
        out.error.kind === "validation"
          ? `Generation rejected: ${out.error.message.slice(0, 140)}`
          : describeError(out.error);
      setGenStatus((g) => ({ ...g, [domain]: { kind: "error", message: msg } }));
      setToast(msg);
      return;
    }
    setGenStatus((g) => ({
      ...g,
      [domain]: {
        kind: "ok",
        cached: out.cached,
        count: out.templates.length,
        at: out.generatedAt,
      },
    }));
    setToast(
      out.cached
        ? `Cached set used — ${out.templates.length} ${DOMAIN_LABELS[domain]} trials ready for ${student.name}.`
        : `Generated ${out.templates.length} ${DOMAIN_LABELS[domain]} trials for ${student.name}.`,
    );
  };

  if (!s) return null;

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
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card className="p-6">
          <SectionHeader
            icon={<Eye size={18} />}
            title="Eye tracking"
            subtitle="Drive the gaze rules and overlay from real webcam tracking (WebGazer) or a built-in simulated stream. The simulator is the fallback whenever a camera isn't available."
          />
          <Row
            label="Enable eye tracking"
            help="Starts a gaze stream at ~10Hz for the session."
            control={
              <Toggle
                checked={s.eyeTrackingEnabled}
                onChange={(v) => update({ eyeTrackingEnabled: v })}
              />
            }
          />
          <Row
            label="Use camera (real tracking)"
            help="Uses the webcam via WebGazer. Falls back to the simulated stream if the camera is blocked or unavailable. Calibrate after turning this on."
            control={
              <Toggle
                checked={s.cameraTracking}
                onChange={(v) => update({ cameraTracking: v })}
              />
            }
          />
          <Row
            label="Show gaze indicator during sessions"
            help="Teacher demo only — shows a dot tracking the gaze. Off for student-facing use."
            control={
              <Toggle
                checked={s.gazeIndicatorEnabled}
                onChange={(v) => update({ gazeIndicatorEnabled: v })}
              />
            }
          />
          <Row
            label="Calibrate"
            control={
              <Button
                size="sm"
                variant="secondary"
                disabled={!s.eyeTrackingEnabled}
                onClick={() => setShowCal(true)}
              >
                Start calibration
              </Button>
            }
            help="A 5-point sequence. Tap each dot when prompted."
          />
          <div className="pt-3">
            <EyeTrackingArchitecturePanel />
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeader
            icon={<Sparkles size={18} />}
            title="AI-generated activities"
            subtitle="Generate fresh trials tailored to a student's reading level and recent performance. Cached locally — identical prompts won't re-fire the API."
          />
          <Row
            label="Anthropic API key"
            control={
              <input
                type="password"
                value={s.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-ant-..."
                className="w-72 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sage"
              />
            }
            help="Stored only on this device."
          />
          <Row
            label="Generate for"
            control={
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              >
                {students.length === 0 && <option value="">No students yet</option>}
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.avatar} {st.name} · {st.grade} · reads at {st.readingLevel}
                  </option>
                ))}
              </select>
            }
          />
          <div className="mt-3 grid sm:grid-cols-3 gap-2">
            {DOMAINS.map((d) => (
              <GenerateButton
                key={d}
                domain={d}
                status={genStatus[d]}
                onClick={() => generate(d)}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Generated sets are tagged with an "AI" chip in the dashboard
            session list and attached to the next session you start with that
            student in the corresponding domain.
          </p>
        </Card>

        <Card className="p-6">
          <SectionHeader
            icon={<Accessibility size={18} />}
            title="Input & access"
            subtitle="Alternative input for students who can't reliably touch a target. Profiles set to 'eye gaze' use scanning automatically."
          />
          <Row
            label="Single-switch scanning"
            help="Highlights choices one at a time. Press Space/Enter, a mapped switch, or the on-screen Select button to choose the highlighted tile."
            control={
              <Toggle
                checked={s.switchScanning}
                onChange={(v) => update({ switchScanning: v })}
              />
            }
          />
          <Row
            label={`Scan dwell: ${(s.switchScanIntervalMs / 1000).toFixed(1)}s per item`}
            help="How long each choice stays highlighted before the scan advances."
            control={
              <input
                type="range"
                min={500}
                max={4000}
                step={250}
                value={s.switchScanIntervalMs}
                onChange={(e) =>
                  update({ switchScanIntervalMs: Number(e.target.value) })
                }
                className="w-48 accent-sage-500"
              />
            }
          />
        </Card>

        <Card className="p-6">
          <SectionHeader
            icon={<KeyRound size={18} />}
            title="Display & audio"
            subtitle="Defaults that apply across student sessions."
          />
          <Row
            label="High-contrast mode"
            control={
              <Toggle
                checked={s.highContrast}
                onChange={(v) => update({ highContrast: v })}
              />
            }
          />
          <Row
            label="OpenDyslexic font for sight words"
            control={
              <Toggle
                checked={s.dyslexicFont}
                onChange={(v) => update({ dyslexicFont: v })}
              />
            }
          />
          <Row
            label={`Audio volume: ${Math.round(s.audioVolume * 100)}%`}
            control={
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.audioVolume}
                onChange={(e) => update({ audioVolume: Number(e.target.value) })}
                className="w-48 accent-sage-500"
              />
            }
          />
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-ink mb-1">Privacy</h3>
          <p className="text-sm text-muted">
            This app runs entirely on your device. Only AI generation calls leave
            your browser, and only when you click a Generate button — they go
            directly to the Anthropic API using the key you provide. No analytics,
            no telemetry. Camera processing, when enabled, will happen in your
            browser and is never recorded.
          </p>
        </Card>
      </main>

      {showCal && (
        <CalibrationOverlay
          onClose={() => setShowCal(false)}
          cameraTracking={s.cameraTracking}
        />
      )}

      <Toast
        show={toast !== null}
        message={toast ?? ""}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}

function GenerateButton({
  domain,
  status,
  onClick,
}: {
  domain: DomainId;
  status: GenStatus;
  onClick: () => void;
}) {
  const running = status.kind === "running";
  const ok = status.kind === "ok";
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      disabled={running}
      className="justify-start"
    >
      {running ? (
        <Loader2 size={14} className="animate-spin" />
      ) : ok ? (
        <Check size={14} className="text-sage-600" />
      ) : (
        <Sparkles size={14} />
      )}
      <span className="truncate">
        {running
          ? `Generating ${DOMAIN_LABELS[domain]}…`
          : ok
            ? `${status.count} new ${DOMAIN_LABELS[domain]}${status.cached ? " (cached)" : ""}`
            : `Generate ${DOMAIN_LABELS[domain]}`}
      </span>
    </Button>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold text-ink inline-flex items-center gap-2">
        <span className="text-sage-600">{icon}</span>
        {title}
      </h2>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

function Row({
  label,
  control,
  help,
}: {
  label: string;
  control: React.ReactNode;
  help?: string;
}) {
  return (
    <div className="py-3 border-t border-line first:border-t-0 flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm text-ink">{label}</div>
        {help && <div className="text-xs text-muted mt-0.5">{help}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        "w-11 h-6 rounded-full transition-colors relative " +
        (checked ? "bg-sage" : "bg-line")
      }
    >
      <span
        className={
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-tile transition-transform " +
          (checked ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}
