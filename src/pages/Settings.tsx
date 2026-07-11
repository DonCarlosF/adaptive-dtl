import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Eye,
  KeyRound,
  Sparkles,
  Loader2,
  Check,
  Accessibility,
  // --- access-inclusion ---
  AlertTriangle,
  // --- end access-inclusion ---
  // --- domains-expansion ---
  Database,
  Download,
  Upload,
  // --- end domains-expansion ---
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
// --- access-inclusion: camera-positioning aid + calibration freshness ---
import { useGazeStore } from "@/eyetracking/gazeStore";
import {
  formatCalibrationAge,
  isCalibrationStale,
} from "@/eyetracking/calibrationFreshness";
// --- end access-inclusion ---
import { isCloudEnabled } from "@/api/client";
import { logout } from "@/api/auth";
import { LogOut } from "lucide-react";
// --- domains-expansion ---
import { exportBackup, importBackup } from "@/lib/backup";
// --- end domains-expansion ---

interface Props {
  onBack: () => void;
  onLogout?: () => void;
}

// --- domains-expansion --- derived from DOMAIN_LABELS so new domains appear automatically.
const DOMAINS: DomainId[] = Object.keys(DOMAIN_LABELS) as DomainId[];
// --- end domains-expansion ---

type GenStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; cached: boolean; count: number; at: number }
  | { kind: "error"; message: string };

export function Settings({ onBack, onLogout }: Props) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [showCal, setShowCal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<Record<DomainId, GenStatus>>(
    // --- domains-expansion --- initial state derived from DOMAINS.
    () =>
      Object.fromEntries(
        DOMAINS.map((d) => [d, { kind: "idle" }]),
      ) as Record<DomainId, GenStatus>,
    // --- end domains-expansion ---
  );
  // --- domains-expansion --- backup / restore state
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  // --- end domains-expansion ---

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

  // --- access-inclusion: camera-positioning preview (transient by design —
  // it's a teacher-only setup aid, so it is deliberately NOT persisted in
  // AppSettings; it resets to off whenever Settings closes so a preview can
  // never leak into a student session). Toggling it on starts the real gaze
  // source if none is running so there is a live video to position with;
  // if we started it, we release the camera again on unmount. ---
  const [camPreview, setCamPreview] = useState(false);
  const startedGazeForPreviewRef = useRef(false);
  const setCameraPreview = (show: boolean) => {
    setCamPreview(show);
    if (show && useGazeStore.getState().mode === "off") {
      startedGazeForPreviewRef.current = true;
      void useGazeStore
        .getState()
        .enable(true)
        .then(() =>
          import("@/eyetracking/webgazerWrapper").then((m) =>
            m.setDebugPreview(true),
          ),
        );
      return;
    }
    void import("@/eyetracking/webgazerWrapper").then((m) =>
      m.setDebugPreview(show),
    );
  };
  useEffect(
    () => () => {
      // Leaving Settings: always hide the preview overlays; release the
      // camera only if the preview toggle was what started it.
      void import("@/eyetracking/webgazerWrapper").then((m) =>
        m.setDebugPreview(false),
      );
      if (startedGazeForPreviewRef.current) useGazeStore.getState().disable();
    },
    [],
  );
  // If camera tracking is switched off while the preview is up, drop the
  // preview too — it is only meaningful for the real webcam source.
  const camTrackingOn = s?.cameraTracking ?? false;
  useEffect(() => {
    if (camTrackingOn) return;
    setCamPreview(false);
    void import("@/eyetracking/webgazerWrapper").then((m) =>
      m.setDebugPreview(false),
    );
  }, [camTrackingOn]);
  // --- end access-inclusion ---

  const generate = async (domain: DomainId) => {
    if (!s) return;
    const student = students.find((x) => x.id === selectedStudentId);
    if (!student) {
      setToast("Add or select a student first.");
      return;
    }
    if (!isCloudEnabled() && !s.apiKey.trim()) {
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

  // --- domains-expansion --- backup / restore handlers
  const handleExport = async () => {
    try {
      const counts = await exportBackup();
      setToast(
        `Backup downloaded — ${counts.students} students, ${counts.sessions} sessions.`,
      );
    } catch (e) {
      setToast(`Export failed: ${(e as Error).message}`);
    }
  };

  const handleImportConfirm = async () => {
    if (!pendingImport || importing) return;
    setImporting(true);
    const result = await importBackup(pendingImport);
    setImporting(false);
    setPendingImport(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setToast(
      `Backup restored — ${result.counts.students} students, ${result.counts.sessions} sessions.`,
    );
    // Re-read everything this page renders from the DB.
    settingsRepo.get().then(setS);
    studentRepo.list().then((rows) => {
      setStudents(rows);
      setSelectedStudentId(rows[0]?.id ?? "");
    });
  };
  // --- end domains-expansion ---

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
        {isCloudEnabled() && onLogout && (
          <Card className="p-6">
            <SectionHeader
              icon={<LogOut size={18} />}
              title="Account"
              subtitle="You're signed in to the cloud backend. Students and sessions sync to your account."
            />
            <Row
              label="Sign out"
              control={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    logout();
                    onLogout();
                  }}
                >
                  Sign out
                </Button>
              }
            />
          </Card>
        )}

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
          {/* --- access-inclusion: camera-positioning aid (transient; not persisted) --- */}
          <Row
            label="Show camera preview (positioning aid)"
            help="Teacher-only setup aid: shows the camera thumbnail and face-feedback box so you can centre the student's face before calibrating. Turns itself off when you leave Settings and never appears in student sessions. Requires camera tracking."
            control={
              <Toggle
                checked={camPreview}
                onChange={setCameraPreview}
                disabled={!s.cameraTracking}
              />
            }
          />
          {/* --- end access-inclusion --- */}
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
          {/* --- access-inclusion: calibration freshness (AppSettings.lastCalibrationAt,
              stamped by the calibration overlay on completion) --- */}
          <div className="pt-2 text-xs">
            <span className="text-muted">
              Last calibrated: {formatCalibrationAge(s.lastCalibrationAt)}
            </span>
            {s.cameraTracking && isCalibrationStale(s.lastCalibrationAt) && (
              <div
                role="note"
                className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  {s.lastCalibrationAt == null
                    ? "Camera tracking is on but has never been calibrated. A quick 5-point calibration with the student seated as usual makes gaze data much more useful."
                    : "It's been over a week since the last calibration. Accuracy drifts as seating and lighting change — consider re-calibrating."}
                </span>
              </div>
            )}
          </div>
          {/* --- end access-inclusion --- */}
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
          {isCloudEnabled() ? (
            <Row
              label="Anthropic API key"
              control={<span className="text-sm text-muted">Managed by the server</span>}
              help="In cloud mode the key lives on the backend and never reaches the browser."
            />
          ) : (
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
          )}
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
          {/* --- access-inclusion: scanning mode (auto dwell vs manual two-switch) --- */}
          <Row
            label="Scanning mode"
            help="Auto: the highlight advances on the dwell timer and one switch (Space/Enter or Select) chooses. Step: no timer — switch 1 (Space or the on-screen Next button) moves the highlight, switch 2 (Enter or Select) chooses it."
            control={
              <select
                value={s.switchScanMode}
                onChange={(e) =>
                  update({
                    switchScanMode: e.target
                      .value as AppSettings["switchScanMode"],
                  })
                }
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="auto">Auto (timed)</option>
                <option value="step">Step (two-switch)</option>
              </select>
            }
          />
          {/* --- end access-inclusion --- */}
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
          {/* --- PWA/Voice/AAC branch additions: alternative input methods --- */}
          <Row
            label="Voice input (spoken answers)"
            help="When supported, the learner can say a choice out loud during a trial. Requires microphone permission; degrades to a no-op where unavailable."
            control={
              <Toggle
                checked={s.voiceInput}
                onChange={(v) => update({ voiceInput: v })}
              />
            }
          />
          <Row
            label="AAC communication board"
            help="Adds a tap-to-talk button in sessions with core words (yes, no, more, stop, help, break, again, done) that speak aloud."
            control={
              <Toggle
                checked={s.aacBoard}
                onChange={(v) => update({ aacBoard: v })}
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
          {/* --- access-inclusion: student-facing language --- */}
          <Row
            label="Student-facing language"
            help="Session narration, break/done screens, scanning buttons, and the AAC board display and speak in this language. Authored trial content (sight words, prompts) stays in English — see src/i18n/README.md."
            control={
              <select
                value={s.language}
                onChange={(e) =>
                  update({ language: e.target.value as AppSettings["language"] })
                }
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="en">English</option>
                <option value="es">Español (Spanish)</option>
              </select>
            }
          />
          {/* --- end access-inclusion --- */}
        </Card>

        {/* --- domains-expansion --- local backup / restore */}
        <Card className="p-6">
          <SectionHeader
            icon={<Database size={18} />}
            title="Data"
            subtitle="Students, sessions, settings, AI trial sets, and on-device ML models all live in this browser. Export a backup before clearing the browser or moving to a new device."
          />
          <Row
            label="Export backup"
            help="Downloads everything as a single JSON file."
            control={
              <Button size="sm" variant="secondary" onClick={handleExport}>
                <Download size={14} /> Export backup
              </Button>
            }
          />
          <Row
            label="Import backup"
            help="Restores from a backup file. This replaces ALL data currently on this device."
            control={
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="Choose a backup file to import"
                  onChange={(e) => {
                    setPendingImport(e.target.files?.[0] ?? null);
                    // Reset so picking the same file again re-triggers change.
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={importing}
                  onClick={() => importInputRef.current?.click()}
                >
                  <Upload size={14} /> Choose file…
                </Button>
              </>
            }
          />
          {pendingImport && (
            <div
              role="alertdialog"
              aria-label="Confirm backup import"
              className="mt-3 rounded-xl border border-coral bg-coral-soft/30 p-4"
            >
              <p className="text-sm text-ink">
                Replace all local data with{" "}
                <span className="font-semibold">{pendingImport.name}</span>?
                The students, sessions, and settings currently on this device
                will be deleted first. This cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={handleImportConfirm}
                  disabled={importing}
                >
                  {importing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {importing ? "Restoring…" : "Replace data"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={importing}
                  onClick={() => setPendingImport(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
        {/* --- end domains-expansion --- */}

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
          onClose={() => {
            setShowCal(false);
            // --- access-inclusion: re-read settings so the freshness line
            // reflects the lastCalibrationAt just stamped by the overlay. ---
            settingsRepo.get().then(setS);
            // --- end access-inclusion ---
          }}
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
  // --- access-inclusion: optional disabled state (camera-preview toggle) ---
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  // --- end access-inclusion ---
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      // --- access-inclusion ---
      disabled={disabled}
      // --- end access-inclusion ---
      onClick={() => onChange(!checked)}
      className={
        "w-11 h-6 rounded-full transition-colors relative " +
        (checked ? "bg-sage" : "bg-line") +
        // --- access-inclusion ---
        (disabled ? " opacity-40 cursor-not-allowed" : "")
        // --- end access-inclusion ---
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
