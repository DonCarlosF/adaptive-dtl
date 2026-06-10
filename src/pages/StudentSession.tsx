import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AdaptationEvent,
  DomainId,
  DOMAIN_LABELS,
  GazeTracePoint,
  PresentedTrial,
  SessionState,
  StudentProfile,
  TrialResult,
  TrialTemplate,
} from "@/engine/types";
import {
  isSessionComplete,
  makeInitialState,
  PLANNED_TRIALS_PER_SESSION,
  reduce,
} from "@/engine/adaptiveEngine";
import { applyGazeRules, GazeWindow } from "@/engine/gazeRules";
import { buildSessionRecord } from "@/engine/sessionLogger";
import { sessionRepo } from "@/db/sessionRepo";
import { settingsRepo } from "@/db/settingsRepo";
import { ChoiceGrid, ChoiceItem } from "@/components/ChoiceGrid";
import { LongPressExit } from "@/components/LongPressExit";
import { Reinforcer } from "@/components/Reinforcer";
import { BreathingDot } from "@/components/BreathingDot";
import { Button } from "@/components/Button";
import { ProgressRing } from "@/components/ProgressRing";
import { GazeIndicator } from "@/components/GazeIndicator";
import { useSpeak } from "@/hooks/useSpeak";
import { useChime } from "@/hooks/useChime";
import { loadTrialsForSession } from "@/ai/activityGenerator";
import { getDomain } from "@/domains/registry";
import {
  setGazeAttractors,
  useGazeStore,
} from "@/eyetracking/gazeStore";
import { Sparkles } from "lucide-react";

interface Props {
  student: StudentProfile;
  domain: DomainId;
  onExit: () => void;
}

type Phase =
  | { kind: "loading" }
  | { kind: "trial"; trial: PresentedTrial; startedAt: number }
  | { kind: "feedback"; correct: boolean }
  | { kind: "break" }
  | { kind: "done"; endedEarly: boolean };

const OFF_SCREEN_BREAK_MS = 5000;

export function StudentSession({ student, domain, onExit }: Props) {
  const [state, setState] = useState<SessionState>(() =>
    makeInitialState(student.id, domain, 2),
  );
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [templates, setTemplates] = useState<TrialTemplate[]>([]);
  const [trialSource, setTrialSource] = useState<"ai" | "authored">("authored");
  const [audioVolume, setAudioVolume] = useState(0.7);
  const [dyslexicFont, setDyslexicFont] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [eyeTrackingOn, setEyeTrackingOn] = useState(false);
  const [showGazeIndicator, setShowGazeIndicator] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const sessionPersistedRef = useRef(false);
  const traceRef = useRef<GazeTracePoint[]>([]);
  const trialStartedAtRef = useRef<number | null>(null);
  const trialEndedAtRef = useRef<number | null>(null);
  const promptRectRef = useRef<DOMRect | null>(null);
  const choiceRectsRef = useRef<Array<{ id: string; rect: DOMRect }>>([]);
  const promptElRef = useRef<HTMLParagraphElement | null>(null);
  const choiceContainerElRef = useRef<HTMLDivElement | null>(null);
  const lastBreakAtRef = useRef<number>(0);

  const { speak, cancel: cancelSpeech } = useSpeak();
  const { chime } = useChime();
  const dom = useMemo(() => getDomain(domain), [domain]);

  // Load templates and settings on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [load, settings] = await Promise.all([
        loadTrialsForSession(domain, student),
        settingsRepo.get(),
      ]);
      if (cancelled) return;
      setTemplates(load.templates);
      setTrialSource(load.source);
      setAudioVolume(settings.audioVolume);
      setDyslexicFont(settings.dyslexicFont);
      setHighContrast(settings.highContrast);
      setEyeTrackingOn(settings.eyeTrackingEnabled);
      setShowGazeIndicator(settings.gazeIndicatorEnabled);
      if (settings.eyeTrackingEnabled) {
        // Start gaze tracking for this session — real camera when opted in,
        // simulated otherwise (with automatic fallback).
        await useGazeStore.getState().enable(settings.cameraTracking);
        useGazeStore.getState().resetBuffer();
      }
    })();
    return () => {
      cancelled = true;
      cancelSpeech();
      // Release the camera / stop the stream when the session unmounts.
      useGazeStore.getState().disable();
    };
  }, [domain, student, cancelSpeech]);

  // Subscribe to gaze samples and copy them into the session trace,
  // tagged with the active trial index. Dedupes by timestamp so unrelated
  // store updates (calibration, enabled flag) don't push duplicates.
  const lastTraceTsRef = useRef<number>(0);
  useEffect(() => {
    if (!eyeTrackingOn) return;
    const unsub = useGazeStore.subscribe((s) => {
      const sample = s.latest;
      if (!sample) return;
      if (sample.timestamp === lastTraceTsRef.current) return;
      lastTraceTsRef.current = sample.timestamp;
      const trialIndex =
        phase.kind === "trial" ? state.trials.length : -1;
      const offScreen =
        sample.x < 0 ||
        sample.x > window.innerWidth ||
        sample.y < 0 ||
        sample.y > window.innerHeight;
      traceRef.current.push({
        x: sample.x,
        y: sample.y,
        timestamp: sample.timestamp,
        confidence: sample.confidence,
        trialIndex,
        offScreen,
      });
    });
    return unsub;
  }, [eyeTrackingOn, phase.kind, state.trials.length]);

  // Off-screen watcher: if eyes are off the screen for >5s during a
  // trial, transition to break. Lower-frequency than the rule, but more
  // responsive (acts mid-trial).
  useEffect(() => {
    if (!eyeTrackingOn) return;
    if (phase.kind !== "trial") return;
    const id = window.setInterval(() => {
      const { lastOnScreenAt, latest } = useGazeStore.getState();
      if (!latest) return;
      const offMs = lastOnScreenAt ? latest.timestamp - lastOnScreenAt : 0;
      if (offMs <= OFF_SCREEN_BREAK_MS) return;
      // Debounce to avoid triggering twice in quick succession.
      const now = Date.now();
      if (now - lastBreakAtRef.current < 8000) return;
      lastBreakAtRef.current = now;
      // Append an adaptation event and switch to break.
      setState((s) => ({
        ...s,
        adaptations: [
          ...s.adaptations,
          {
            kind: "suggest-break",
            trialIndex: state.trials.length,
            reason: `Eyes off screen for ${(offMs / 1000).toFixed(
              1,
            )}s during trial — switching to break.`,
            timestamp: now,
          },
        ],
      }));
      cancelSpeech();
      setPhase({ kind: "break" });
      speak("Take a moment. We can keep going when you're ready.", {
        volume: audioVolume,
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [eyeTrackingOn, phase.kind, state.trials.length, audioVolume, speak, cancelSpeech]);

  // Kick off the first trial once templates load.
  useEffect(() => {
    if (templates.length > 0 && phase.kind === "loading") {
      presentTrial(state, templates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  // After each render where a trial is on screen, measure rects and
  // update the simulator's attractors so the synthetic gaze biases
  // toward the current prompt + choices.
  useLayoutEffect(() => {
    if (phase.kind !== "trial") {
      promptRectRef.current = null;
      choiceRectsRef.current = [];
      setGazeAttractors([]);
      return;
    }
    const promptRect = promptElRef.current?.getBoundingClientRect() ?? null;
    promptRectRef.current = promptRect;
    const container = choiceContainerElRef.current;
    const tiles = container
      ? Array.from(container.querySelectorAll<HTMLElement>("[data-choice-id]"))
      : [];
    const rects: Array<{ id: string; rect: DOMRect }> = tiles.map((t) => ({
      id: t.getAttribute("data-choice-id") ?? "",
      rect: t.getBoundingClientRect(),
    }));
    choiceRectsRef.current = rects;
    const attractors = [
      ...(promptRect ? [promptRect] : []),
      ...rects.map((r) => r.rect),
    ];
    setGazeAttractors(attractors);
  }, [phase]);

  const presentTrial = useCallback(
    (s: SessionState, allTemplates: TrialTemplate[]) => {
      const used = new Set(s.trials.map((t) => t.templateId));
      const remaining = allTemplates.filter((t) => !used.has(t.id));
      const pickFrom = remaining.length > 0 ? remaining : allTemplates;
      const tpl = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      const trial = buildPresentedTrial(tpl, s);
      trialStartedAtRef.current = null;
      trialEndedAtRef.current = null;
      setPhase({ kind: "trial", trial, startedAt: 0 });
      speak(trial.prompt, {
        volume: audioVolume,
        onEnd: () => {
          trialStartedAtRef.current = Date.now();
          setPhase((p) =>
            p.kind === "trial" ? { ...p, startedAt: performance.now() } : p,
          );
        },
      });
    },
    [speak, audioVolume],
  );

  const buildGazeWindow = useCallback((): GazeWindow => {
    const buf = useGazeStore.getState().buffer;
    return {
      samples: buf,
      lastOnScreenAt: useGazeStore.getState().lastOnScreenAt,
      trialStartedAt: trialStartedAtRef.current,
      trialEndedAt: trialEndedAtRef.current,
      promptRect: promptRectRef.current,
      choiceRects: choiceRectsRef.current,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, []);

  const handleChoose = useCallback(
    (choiceId: string) => {
      if (phase.kind !== "trial" || phase.startedAt === 0) return;
      const correct = choiceId === phase.trial.correctChoiceId;
      const responseTimeMs = performance.now() - phase.startedAt;

      if (correct) {
        chime(audioVolume);
      } else {
        setPhase({
          kind: "trial",
          trial: { ...phase.trial, errorlessHighlight: true },
          startedAt: phase.startedAt,
        });
        speak(phase.trial.prompt, { volume: audioVolume });
        return;
      }

      trialEndedAtRef.current = Date.now();

      const result: TrialResult = {
        index: state.trials.length,
        templateId: phase.trial.templateId,
        domain,
        numChoices: state.numChoices,
        correct,
        responseTimeMs,
        errorlessHighlight: phase.trial.errorlessHighlight,
        timestamp: Date.now(),
      };

      const { next, decision } = reduce(state, result);

      // Compose gaze rules on top of the response-based reduce result.
      let mergedNext = next;
      let mergedDecision = decision;
      if (eyeTrackingOn) {
        const gazeWin = buildGazeWindow();
        const out = applyGazeRules({
          state: next,
          window: gazeWin,
          trialIndex: result.index,
        });
        if (out.adaptations.length > 0) {
          mergedNext = {
            ...next,
            adaptations: [...next.adaptations, ...out.adaptations],
          };
        }
        mergedDecision = { ...decision, ...(out.decisionPatch ?? {}) };
      }

      setState(mergedNext);
      setPhase({ kind: "feedback", correct: true });

      window.setTimeout(() => {
        if (mergedDecision.endEarly) {
          setPhase({ kind: "done", endedEarly: true });
          return;
        }
        if (isSessionComplete(mergedNext)) {
          setPhase({ kind: "done", endedEarly: false });
          return;
        }
        if (mergedDecision.suggestBreak) {
          lastBreakAtRef.current = Date.now();
          setPhase({ kind: "break" });
          speak("Take a moment. We can keep going when you're ready.", {
            volume: audioVolume,
          });
          return;
        }
        presentTrial(mergedNext, templates);
      }, 1600);
    },
    [
      phase,
      state,
      domain,
      chime,
      audioVolume,
      speak,
      templates,
      presentTrial,
      eyeTrackingOn,
      buildGazeWindow,
    ],
  );

  // Persist session when we hit "done".
  useEffect(() => {
    if (phase.kind !== "done") return;
    if (sessionPersistedRef.current) return;
    sessionPersistedRef.current = true;
    const rec = buildSessionRecord(state, startedAtRef.current, phase.endedEarly);
    rec.aiGenerated = trialSource === "ai";
    if (eyeTrackingOn) {
      rec.gazeTrace = traceRef.current.slice();
    }
    sessionRepo.save(rec);
  }, [phase, state, trialSource, eyeTrackingOn]);

  const resumeFromBreak = useCallback(() => {
    presentTrial(state, templates);
  }, [presentTrial, state, templates]);

  const containerClass = highContrast
    ? "fixed inset-0 bg-white text-black"
    : "fixed inset-0 bg-canvas text-ink";

  return (
    <div className={containerClass}>
      <LongPressExit onExit={onExit} />
      <SessionHud state={state} domain={domain} aiGenerated={trialSource === "ai"} />

      <div className="absolute inset-0 flex items-center justify-center px-6">
        {phase.kind === "loading" && (
          <div className="text-muted">Getting things ready…</div>
        )}

        {phase.kind === "trial" && (
          <TrialView
            trial={phase.trial}
            onChoose={handleChoose}
            locked={phase.startedAt === 0}
            renderChoice={(id) => dom.renderChoice(id, { dyslexicFont })}
            ariaLabel={dom.ariaLabel}
            promptRef={promptElRef}
            choiceContainerRef={choiceContainerElRef}
          />
        )}

        {phase.kind === "feedback" && (
          <Reinforcer show lowStim={student.lowStim} />
        )}

        {phase.kind === "break" && <BreakView onResume={resumeFromBreak} />}

        {phase.kind === "done" && (
          <DoneView
            student={student}
            state={state}
            endedEarly={phase.endedEarly}
            onExit={onExit}
            domain={domain}
          />
        )}
      </div>

      {eyeTrackingOn && <GazeIndicator enabled={showGazeIndicator} />}
    </div>
  );
}

function buildPresentedTrial(
  tpl: TrialTemplate,
  state: SessionState,
): PresentedTrial {
  const others = tpl.choiceIds.filter((id) => id !== tpl.correctChoiceId);
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  const distractors = shuffled.slice(0, state.numChoices - 1);
  const ordered = [tpl.correctChoiceId, ...distractors].sort(
    () => Math.random() - 0.5,
  );
  return {
    templateId: tpl.id,
    prompt: tpl.prompt,
    correctChoiceId: tpl.correctChoiceId,
    choiceIds: ordered,
    errorlessHighlight: state.errorlessHighlight,
  };
}

function TrialView({
  trial,
  onChoose,
  locked,
  renderChoice,
  ariaLabel,
  promptRef,
  choiceContainerRef,
}: {
  trial: PresentedTrial;
  onChoose: (id: string) => void;
  locked: boolean;
  renderChoice: (id: string) => React.ReactNode;
  ariaLabel: (id: string) => string;
  promptRef: React.MutableRefObject<HTMLParagraphElement | null>;
  choiceContainerRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const items: ChoiceItem[] = trial.choiceIds.map((id) => ({
    id,
    render: renderChoice(id),
    ariaLabel: ariaLabel(id),
  }));
  return (
    <div className="w-full max-w-5xl">
      <p
        ref={promptRef}
        className="text-center text-2xl md:text-3xl text-ink mb-10 font-medium"
      >
        {trial.prompt}
      </p>
      <div ref={choiceContainerRef}>
        <ChoiceGrid
          choices={items}
          correctId={trial.correctChoiceId}
          selectedId={null}
          errorlessHighlight={trial.errorlessHighlight}
          locked={locked}
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}

function BreakView({ onResume }: { onResume: () => void }) {
  return (
    <div className="text-center max-w-md">
      <div className="flex justify-center mb-6">
        <BreathingDot size={120} />
      </div>
      <h2 className="text-2xl font-semibold text-ink mb-2">Take a moment.</h2>
      <p className="text-muted mb-6">
        Watch the dot. Breathe in as it grows, breathe out as it shrinks.
      </p>
      <Button size="lg" onClick={onResume}>
        I'm ready
      </Button>
    </div>
  );
}

function DoneView({
  student,
  state,
  endedEarly,
  onExit,
  domain,
}: {
  student: StudentProfile;
  state: SessionState;
  endedEarly: boolean;
  onExit: () => void;
  domain: DomainId;
}) {
  const correct = state.trials.filter((t) => t.correct).length;
  return (
    <div className="text-center max-w-lg">
      <h2 className="text-3xl font-semibold text-ink mb-2">
        Nice work, {student.name}.
      </h2>
      <p className="text-muted mb-2">Ready when you are.</p>
      <div className="text-sm text-muted mb-6">
        {DOMAIN_LABELS[domain]} · {correct} of {state.trials.length} correct
        {endedEarly && " · session ended early"}
      </div>
      <Button size="lg" onClick={onExit}>
        Back to dashboard
      </Button>
    </div>
  );
}

function SessionHud({
  state,
  domain,
  aiGenerated,
}: {
  state: SessionState;
  domain: DomainId;
  aiGenerated: boolean;
}) {
  const planned = PLANNED_TRIALS_PER_SESSION;
  const last = state.adaptations.at(-1);
  return (
    <div className="absolute top-4 left-4 flex items-center gap-3 select-none">
      <ProgressRing
        progress={state.trials.length / planned}
        size={44}
        stroke={4}
      >
        <span className="text-xs text-muted font-medium">
          {state.trials.length}/{planned}
        </span>
      </ProgressRing>
      <div className="text-xs text-muted">
        <div className="font-medium text-ink inline-flex items-center gap-1.5">
          {DOMAIN_LABELS[domain]}
          {aiGenerated && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sage-50 text-sage-600 border border-sage-100">
              AI
            </span>
          )}
        </div>
        <div>
          {state.numChoices} choices
          {state.errorlessHighlight && " · errorless"}
        </div>
      </div>
      {last && <AdaptationToast event={last} />}
    </div>
  );
}

function AdaptationToast({ event }: { event: AdaptationEvent }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(t);
  }, [event.timestamp, event.kind]);
  if (!show) return null;
  return (
    <div className="ml-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-50 border border-sage-100 text-sage-600 text-xs animate-softIn max-w-md">
      <Sparkles size={12} />
      <span className="truncate">{event.reason}</span>
    </div>
  );
}
