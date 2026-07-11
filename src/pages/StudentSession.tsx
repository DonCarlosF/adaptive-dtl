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
// --- ML adaptation: additive on-device ML layer. See src/ml/README.md. ---
import { scoreAttention } from "@/ml/attentionModel";
import {
  DifficultyModel,
  initModel,
  recommend,
  update as updateMlModel,
} from "@/ml/difficultyModel";
import { buildDifficultyFeatures } from "@/ml/sessionFeatures";
import { mlModelRepo } from "@/db/mlModelRepo";
// --------------------------------------------------------------------------
import { ChoiceGrid, ChoiceItem } from "@/components/ChoiceGrid";
import { LongPressExit } from "@/components/LongPressExit";
import { Reinforcer } from "@/components/Reinforcer";
import { BreathingDot } from "@/components/BreathingDot";
import { Button } from "@/components/Button";
import { ProgressRing } from "@/components/ProgressRing";
import { GazeIndicator } from "@/components/GazeIndicator";
import { useSpeak } from "@/hooks/useSpeak";
import { useChime } from "@/hooks/useChime";
import { useSwitchScanning } from "@/hooks/useSwitchScanning";
// --- PWA/Voice/AAC branch additions ---
import { useSpeechRecognition } from "@/voice/useSpeechRecognition";
import { AACBoard } from "@/components/AACBoard";
import { usePrefersReducedMotion } from "@/a11y/usePrefersReducedMotion";
import { Mic, MessageSquare } from "lucide-react";
// --- end additions ---
import { loadTrialsForSession } from "@/ai/activityGenerator";
import { getDomain } from "@/domains/registry";
import {
  setGazeAttractors,
  useGazeStore,
} from "@/eyetracking/gazeStore";
import { Sparkles } from "lucide-react";
// --- realtime co-presence: imports ---
import { useSessionBroadcast } from "@/realtime/useSessionBroadcast";
import type { Snapshot } from "@/realtime/protocol";
// --- end realtime co-presence ---
// --- access-inclusion: scanning modes + student-facing i18n ---
import { Language, setLanguage, t, ttsLang } from "@/i18n/strings";
// --- end access-inclusion ---

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
  const [switchScanning, setSwitchScanning] = useState(false);
  const [switchScanIntervalMs, setSwitchScanIntervalMs] = useState(1500);
  // --- access-inclusion: scan mode + student-facing language ---
  const [switchScanMode, setSwitchScanMode] = useState<"auto" | "step">("auto");
  // Mirrored in state (not just the module-level i18n setter) so a non-"en"
  // language forces a re-render of every t()-rendered label after settings
  // load, and so speak() callsites carry it in their dependency lists.
  const [sessionLang, setSessionLang] = useState<Language>("en");
  // --- end access-inclusion ---
  // --- PWA/Voice/AAC branch additions ---
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [aacEnabled, setAacEnabled] = useState(false);
  const [aacOpen, setAacOpen] = useState(false);
  // --- end additions ---

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
  // --- ML adaptation: per-(student, domain) model trains across the whole
  // session in this ref (mutable so per-trial updates don't re-render); loaded
  // on mount, persisted on session-done. ---
  const mlModelRef = useRef<DifficultyModel>(initModel());

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
      // Switch scanning is the natural input for "eye gaze" / "both" profiles
      // and anyone the teacher has turned it on for.
      setSwitchScanning(
        settings.switchScanning || student.responseMethod === "eye gaze",
      );
      setSwitchScanIntervalMs(settings.switchScanIntervalMs);
      // --- access-inclusion: scan mode + student-facing language ---
      setSwitchScanMode(settings.switchScanMode);
      setLanguage(settings.language);
      setSessionLang(settings.language);
      // --- end access-inclusion ---
      // --- PWA/Voice/AAC branch additions ---
      setVoiceEnabled(settings.voiceInput);
      setAacEnabled(settings.aacBoard);
      // --- end additions ---
      if (settings.eyeTrackingEnabled) {
        // Start gaze tracking for this session — real camera when opted in,
        // simulated otherwise (with automatic fallback).
        await useGazeStore.getState().enable(settings.cameraTracking);
        useGazeStore.getState().resetBuffer();
      }
      // --- ML adaptation: load this student's cross-session model. ---
      const model = await mlModelRepo.getModel(student.id, domain);
      if (!cancelled) mlModelRef.current = model;
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
      // --- access-inclusion: localized narration ---
      speak(t("takeAMoment"), {
        volume: audioVolume,
        lang: ttsLang(sessionLang),
      });
      // --- end access-inclusion ---
    }, 500);
    return () => window.clearInterval(id);
  }, [eyeTrackingOn, phase.kind, state.trials.length, audioVolume, speak, cancelSpeech, sessionLang]);

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

      // --- ML adaptation: advisory, strictly additive. Score engagement from
      // the gaze buffer, ask the difficulty model, log it, and bias numChoices
      // ONLY in the safe direction — never reversing a safety drop/early-end.
      // Then train the model on this trial's actual outcome. ---
      {
        const attnSamples = eyeTrackingOn ? useGazeStore.getState().buffer : [];
        const attention = scoreAttention(attnSamples, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        const features = buildDifficultyFeatures({
          trials: mergedNext.trials,
          attentionScore: attention.score,
          numChoices: mergedDecision.numChoices,
          errorlessHighlight: mergedDecision.errorlessHighlight,
        });
        const mlDecision = recommend(mlModelRef.current, features);

        let mlNumChoices = mergedDecision.numChoices;
        const rulesForcedEasier =
          mergedDecision.errorlessHighlight || next.numChoices < state.numChoices;
        const MIN_CONFIDENCE = 0.4;
        let mlActed = false;
        if (mlDecision.confidence >= MIN_CONFIDENCE && !mergedDecision.endEarly) {
          if (mlDecision.recommendation === "lower" && mlNumChoices > 2) {
            mlNumChoices = (mlNumChoices - 1) as 2 | 3 | 4;
            mlActed = true;
          } else if (
            mlDecision.recommendation === "raise" &&
            mlNumChoices < 4 &&
            !rulesForcedEasier &&
            mlDecision.confidence >= 0.6
          ) {
            mlNumChoices = (mlNumChoices + 1) as 2 | 3 | 4;
            mlActed = true;
          }
        }

        const mlAdaptations: AdaptationEvent[] = mlActed
          ? [
              {
                kind:
                  mlDecision.recommendation === "lower"
                    ? "decrease-choices"
                    : "increase-choices",
                trialIndex: result.index,
                reason: mlDecision.reason,
                timestamp: Date.now(),
              },
            ]
          : [];

        mergedDecision = { ...mergedDecision, numChoices: mlNumChoices };
        mergedNext = {
          ...mergedNext,
          numChoices: mlNumChoices,
          adaptations: [...mergedNext.adaptations, ...mlAdaptations],
        };

        // Train on the clean-success signal: an incorrect tap re-prompts with
        // the errorless highlight rather than recording a miss, so a clean
        // answer (no highlight) is the positive outcome we learn on.
        const cleanSuccess = result.correct && !result.errorlessHighlight;
        mlModelRef.current = updateMlModel(mlModelRef.current, features, cleanSuccess);
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
          // --- access-inclusion: localized narration ---
          speak(t("takeAMoment"), {
            volume: audioVolume,
            lang: ttsLang(sessionLang),
          });
          // --- end access-inclusion ---
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
      // --- access-inclusion ---
      sessionLang,
      // --- end access-inclusion ---
    ],
  );

  // Switch scanning input. Active only during an unlocked trial; a switch
  // activation (Space/Enter or the on-screen buttons) chooses whichever
  // tile is currently highlighted.
  // --- access-inclusion: mode-aware scanning. "auto" keeps the original
  // dwell behavior; "step" is manual two-switch (Space/Next advances,
  // Enter/Select chooses; no timer). ---
  const scanActive = phase.kind === "trial" && phase.startedAt !== 0;
  const scanCount = phase.kind === "trial" ? phase.trial.choiceIds.length : 0;
  const { index: scanIndex, select: scanSelect, next: scanNext } =
    useSwitchScanning({
      enabled: switchScanning,
      count: scanCount,
      intervalMs: switchScanIntervalMs,
      active: scanActive,
      mode: switchScanMode,
      onSelect: (i) => {
        if (phase.kind !== "trial") return;
        const id = phase.trial.choiceIds[i];
        if (id) handleChoose(id);
      },
    });
  // --- end access-inclusion ---

  // --- realtime co-presence: broadcast + remote control (additive) ---
  // The teacher's live monitor mirrors this session and can steer it. All of
  // the co-presence wiring funnels through the single hook below; it no-ops
  // entirely when the cloud backend isn't configured.
  const latestGaze = useGazeStore((s) => s.latest);

  const broadcastSnapshot = useMemo<Snapshot | null>(() => {
    const correct = state.trials.filter((t) => t.correct).length;
    return {
      phase: phase.kind,
      domain,
      trialIndex: state.trials.length,
      plannedTrials: PLANNED_TRIALS_PER_SESSION,
      correct,
      numChoices: state.numChoices,
      errorlessHighlight: state.errorlessHighlight,
      gaze:
        eyeTrackingOn && latestGaze
          ? {
              x: latestGaze.x,
              y: latestGaze.y,
              confidence: latestGaze.confidence,
              vw: window.innerWidth,
              vh: window.innerHeight,
            }
          : null,
      lastAdaptation: state.adaptations.at(-1)
        ? {
            kind: state.adaptations.at(-1)!.kind,
            reason: state.adaptations.at(-1)!.reason,
            timestamp: state.adaptations.at(-1)!.timestamp,
          }
        : null,
    };
  }, [phase.kind, state, domain, eyeTrackingOn, latestGaze]);

  const handleRemoteControl = useCallback(
    (control: { control: string; numChoices?: 2 | 3 | 4 }) => {
      if (control.control === "force-break") {
        if (phase.kind === "done") return;
        lastBreakAtRef.current = Date.now();
        cancelSpeech();
        setPhase({ kind: "break" });
        // --- access-inclusion: localized narration ---
        speak(t("takeAMoment"), {
          volume: audioVolume,
          lang: ttsLang(sessionLang),
        });
        // --- end access-inclusion ---
      } else if (
        control.control === "set-num-choices" &&
        control.numChoices != null
      ) {
        setState((s) => ({ ...s, numChoices: control.numChoices! }));
      } else if (control.control === "end-session") {
        cancelSpeech();
        setPhase({ kind: "done", endedEarly: true });
      }
    },
    // --- access-inclusion: + sessionLang ---
    [phase.kind, audioVolume, speak, cancelSpeech, sessionLang],
    // --- end access-inclusion ---
  );

  const { joinCode, teacherWatching } = useSessionBroadcast(
    { enabled: phase.kind !== "done", snapshot: broadcastSnapshot },
    handleRemoteControl,
  );
  // --- end realtime co-presence ---

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
    // --- ML adaptation: persist the model trained this session so it carries
    // forward to the student's next session. ---
    mlModelRepo.saveModel(student.id, domain, mlModelRef.current);
  }, [phase, state, trialSource, eyeTrackingOn, student.id, domain]);

  const resumeFromBreak = useCallback(() => {
    presentTrial(state, templates);
  }, [presentTrial, state, templates]);

  // --- PWA/Voice/AAC branch additions ---
  const reduceMotion = usePrefersReducedMotion();

  // Labelled choices for the current trial, used for voice matching.
  const voiceChoices = useMemo(
    () =>
      phase.kind === "trial"
        ? phase.trial.choiceIds.map((id) => ({ id, label: dom.ariaLabel(id) }))
        : [],
    [phase, dom],
  );

  // Spoken-answer input. A confident match routes through the same
  // handleChoose path as a touch/scan selection. Inert no-op when the
  // browser lacks SpeechRecognition (supported === false).
  const speech = useSpeechRecognition({
    choices: voiceChoices,
    onMatch: (m) => handleChoose(m.id),
  });

  // Listen only while a trial is unlocked (prompt finished speaking) so we
  // never capture the app's own TTS as input.
  const trialUnlocked = phase.kind === "trial" && phase.startedAt !== 0;
  useEffect(() => {
    if (!voiceEnabled || !speech.supported) return;
    if (trialUnlocked) speech.start();
    else speech.stop();
    // speech.start/stop are stable (useCallback); phase drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, speech.supported, trialUnlocked]);

  // AAC "break"/"help" → drop into the calm break screen.
  const goToBreak = useCallback(() => {
    setAacOpen(false);
    if (phase.kind === "break" || phase.kind === "done") return;
    cancelSpeech();
    lastBreakAtRef.current = Date.now();
    setPhase({ kind: "break" });
    // --- access-inclusion: localized narration ---
    speak(t("takeAMoment"), {
      volume: audioVolume,
      lang: ttsLang(sessionLang),
    });
    // --- end access-inclusion ---
  }, [phase.kind, cancelSpeech, speak, audioVolume, sessionLang]);

  // AAC "again" → re-read the current prompt.
  const rereadPrompt = useCallback(() => {
    if (phase.kind === "trial") speak(phase.trial.prompt, { volume: audioVolume });
  }, [phase, speak, audioVolume]);
  // --- end additions ---

  const containerClass = highContrast
    ? "fixed inset-0 bg-white text-black"
    : "fixed inset-0 bg-canvas text-ink";

  return (
    <div className={containerClass}>
      <LongPressExit onExit={onExit} />
      <SessionHud state={state} domain={domain} aiGenerated={trialSource === "ai"} />

      <div className="absolute inset-0 flex items-center justify-center px-6">
        {phase.kind === "loading" && (
          // --- access-inclusion: localized ---
          <div className="text-muted">{t("gettingReady")}</div>
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
            scanIndex={switchScanning ? scanIndex : -1}
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

      {/* --- access-inclusion: on-screen switch controls adapt to the scan
          mode. auto = single Select switch (original behavior); step adds a
          Next switch that advances the highlight manually. Labels/aria are
          localized (student-facing). --- */}
      {switchScanning && scanActive && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
          {switchScanMode === "step" && (
            <button
              onClick={scanNext}
              aria-label={t("nextAria")}
              className="h-20 px-10 rounded-tile bg-white text-sky-600 border-2 border-sky-500 text-xl font-semibold shadow-card hover:bg-sky-50 active:bg-sky-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 select-none"
            >
              {t("nextButton")}
            </button>
          )}
          <button
            onClick={scanSelect}
            aria-label={t("selectAria")}
            className="h-20 px-12 rounded-tile bg-sky-500 text-white text-xl font-semibold shadow-card hover:bg-sky-600 active:bg-sky-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 select-none"
          >
            {t("selectButton")}
          </button>
        </div>
      )}
      {/* --- end access-inclusion --- */}

      {/* realtime co-presence: small join-code chip for the teacher's monitor. */}
      {joinCode && <JoinCodeChip code={joinCode} watching={teacherWatching} />}

      {/* --- PWA/Voice/AAC branch additions --- */}
      {/* Listening indicator: visible cue + SR announcement of interim text. */}
      {voiceEnabled && speech.supported && speech.listening && (
        <div
          className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-sage-50 border border-sage-200 px-3 py-1.5 text-sage-600 text-xs"
          role="status"
        >
          <Mic size={14} className={reduceMotion ? undefined : "animate-pulse"} />
          {/* --- access-inclusion: localized --- */}
          <span>{t("listening")}{speech.transcript ? `: "${speech.transcript}"` : "…"}</span>
        </div>
      )}

      {/* AAC board toggle — only while a session is active. */}
      {aacEnabled && (phase.kind === "trial" || phase.kind === "break") && (
        <button
          onClick={() => setAacOpen(true)}
          // --- access-inclusion: localized label + aria ---
          aria-label={t("aacOpenAria")}
          className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white border border-line shadow-tile px-4 py-2 text-sm text-ink hover:bg-sage-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
        >
          <MessageSquare size={16} className="text-sage-600" />
          {t("aacOpenButton")}
          {/* --- end access-inclusion --- */}
        </button>
      )}

      {aacEnabled && (
        <AACBoard
          open={aacOpen}
          onClose={() => setAacOpen(false)}
          onBreak={goToBreak}
          onAgain={rereadPrompt}
          onDone={() => setAacOpen(false)}
          volume={audioVolume}
          // --- access-inclusion: per-student fringe vocabulary ---
          extraWords={student.aacWords}
          // --- end access-inclusion ---
        />
      )}
      {/* --- end additions --- */}
    </div>
  );
}

// realtime co-presence: unobtrusive code shown when a room is live.
function JoinCodeChip({ code, watching }: { code: string; watching: boolean }) {
  return (
    <div className="absolute top-4 right-4 select-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-line text-xs text-muted">
      <span
        className={
          "inline-block w-1.5 h-1.5 rounded-full " +
          (watching ? "bg-sage" : "bg-line")
        }
        aria-hidden
      />
      <span>{watching ? "Teacher watching" : "Monitor code"}</span>
      <span className="font-mono tracking-widest text-ink">{code}</span>
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
  scanIndex,
}: {
  trial: PresentedTrial;
  onChoose: (id: string) => void;
  locked: boolean;
  renderChoice: (id: string) => React.ReactNode;
  ariaLabel: (id: string) => string;
  promptRef: React.MutableRefObject<HTMLParagraphElement | null>;
  choiceContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  scanIndex: number;
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
        // a11y: announce the prompt to assistive tech as it changes.
        role="status"
        aria-live="polite"
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
          scanIndex={scanIndex}
        />
      </div>
    </div>
  );
}

function BreakView({ onResume }: { onResume: () => void }) {
  // --- access-inclusion: break screen is student-facing → localized. ---
  return (
    <div className="text-center max-w-md">
      <div className="flex justify-center mb-6">
        <BreathingDot size={120} />
      </div>
      <h2 className="text-2xl font-semibold text-ink mb-2">{t("breakTitle")}</h2>
      <p className="text-muted mb-6">{t("breakBody")}</p>
      <Button size="lg" onClick={onResume}>
        {t("imReady")}
      </Button>
    </div>
  );
  // --- end access-inclusion ---
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
  const correct = state.trials.filter((r) => r.correct).length;
  // --- access-inclusion: done screen is student-facing → localized.
  // DOMAIN_LABELS stay English (authored content boundary, src/i18n/README.md). ---
  return (
    <div className="text-center max-w-lg">
      <h2 className="text-3xl font-semibold text-ink mb-2">
        {t("doneTitle", { name: student.name })}
      </h2>
      <p className="text-muted mb-2">{t("doneReady")}</p>
      <div className="text-sm text-muted mb-6">
        {DOMAIN_LABELS[domain]} ·{" "}
        {t("correctOf", { correct, total: state.trials.length })}
        {endedEarly && ` · ${t("endedEarly")}`}
      </div>
      <Button size="lg" onClick={onExit}>
        {t("backToDashboard")}
      </Button>
    </div>
  );
  // --- end access-inclusion ---
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
