/**
 * Teacher co-pilot drawer.
 *
 * A right-side drawer opened from a student's detail view. It grounds a
 * streaming Claude conversation in the selected student's session history and
 * offers a one-click "Draft IEP progress note" action that renders a
 * zod-validated structured note.
 *
 * Heavy paths (the streaming client, the prompt/zod modules) are dynamically
 * imported on first use so this drawer — and the dashboard that owns its
 * entry button — stays out of the initial chunk. The component itself is also
 * lazy-loaded by StudentDetail.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, X, FileText, Loader2, StopCircle } from "lucide-react";
import { Button } from "@/components/Button";
import { SessionRecord, StudentProfile } from "@/engine/types";
import { sessionRepo } from "@/db/sessionRepo";
import { settingsRepo } from "@/db/settingsRepo";
import { describeError } from "@/ai/anthropicErrors";
import { buildCopilotContext, CopilotContext } from "@/ai/copilotContext";
import type { IepProgressNote } from "@/ai/copilotPrompts";

interface Props {
  student: StudentProfile;
  onClose: () => void;
}

/** Models offered for the chat toggle; chat defaults to fast Sonnet. */
const COPILOT_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet (fast)" },
  { id: "claude-opus-4-8", label: "Opus (deeper)" },
] as const;

/**
 * IEP progress notes always use the deepest model regardless of the chat
 * toggle — the output is clinical-adjacent structured text that benefits
 * from the stronger model, and it's a low-frequency, high-stakes action.
 */
const IEP_MODEL = "claude-opus-4-8";

interface ChatTurn {
  role: "teacher" | "copilot";
  text: string;
  /** True while this co-pilot turn is still streaming. */
  streaming?: boolean;
  /** Set if this turn failed. */
  error?: boolean;
}

const SUGGESTIONS = [
  "What should I work on next?",
  "Summarize this student's progress.",
  "Are the engine's adaptations helping?",
];

export function Copilot({ student, onClose }: Props) {
  const [ctx, setCtx] = useState<CopilotContext | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>(COPILOT_MODELS[0].id);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [iep, setIep] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; note: IepProgressNote }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load the student's sessions + settings and build the grounding context.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      sessionRepo.listForStudent(student.id),
      settingsRepo.get(),
    ]).then(([sessions, settings]: [SessionRecord[], { apiKey: string }]) => {
      if (cancelled) return;
      setCtx(buildCopilotContext(student, sessions));
      setApiKey(settings.apiKey ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [student]);

  // Auto-scroll the transcript as it grows. Guarded: scrollTo isn't
  // implemented in jsdom (tests) and may be absent in older engines.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [turns]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const canSend = useMemo(
    () => !!ctx && input.trim().length > 0 && !busy,
    [ctx, input, busy],
  );

  const send = async (question: string) => {
    if (!ctx || busy || !question.trim()) return;
    setInput("");
    setTurns((t) => [
      ...t,
      { role: "teacher", text: question.trim() },
      { role: "copilot", text: "", streaming: true },
    ]);
    setBusy(true);

    const [{ streamAnthropic }, prompts] = await Promise.all([
      import("@/ai/anthropicStream"),
      import("@/ai/copilotPrompts"),
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const out = await streamAnthropic({
      apiKey: apiKey.trim() || undefined,
      model,
      systemPrompt: prompts.COPILOT_SYSTEM_PROMPT,
      userPrompt: prompts.buildCopilotUserPrompt(ctx, question),
      signal: ctrl.signal,
      onToken: (frag) =>
        setTurns((t) => {
          const next = [...t];
          const last = next[next.length - 1];
          if (last?.role === "copilot" && last.streaming) {
            next[next.length - 1] = { ...last, text: last.text + frag };
          }
          return next;
        }),
    });

    setTurns((t) => {
      const next = [...t];
      const last = next[next.length - 1];
      if (last?.role === "copilot") {
        next[next.length - 1] = out.ok
          ? { role: "copilot", text: out.result.text }
          : { role: "copilot", text: describeError(out.error), error: true };
      }
      return next;
    });
    setBusy(false);
    abortRef.current = null;
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const draftIep = async () => {
    if (!ctx || busy) return;
    setIep({ kind: "loading" });
    setBusy(true);

    const [{ streamAnthropic }, prompts] = await Promise.all([
      import("@/ai/anthropicStream"),
      import("@/ai/copilotPrompts"),
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // IEP draft uses the deeper model regardless of the chat toggle (see IEP_MODEL).
    const out = await streamAnthropic({
      apiKey: apiKey.trim() || undefined,
      model: IEP_MODEL,
      systemPrompt: prompts.IEP_SYSTEM_PROMPT,
      userPrompt: prompts.buildIepUserPrompt(ctx),
      maxTokens: 1500,
      signal: ctrl.signal,
    });
    abortRef.current = null;
    setBusy(false);

    if (!out.ok) {
      setIep({ kind: "error", message: describeError(out.error) });
      return;
    }
    const parsed = prompts.parseIepNote(out.result.text);
    if (!parsed.ok) {
      setIep({ kind: "error", message: `Draft rejected: ${parsed.message.slice(0, 160)}` });
      return;
    }
    setIep({ kind: "ok", note: parsed.note });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-softIn">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="relative w-full max-w-xl h-full bg-canvas border-l border-line shadow-card flex flex-col"
        role="dialog"
        aria-label={`Co-pilot for ${student.name}`}
      >
        <header className="flex items-center justify-between px-5 h-16 border-b border-line bg-white/70">
          <div className="inline-flex items-center gap-2">
            <Sparkles size={18} className="text-sage-600" />
            <h2 className="font-semibold text-ink">
              Co-pilot · <span className="text-muted font-normal">{student.name}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-xl border border-line bg-white px-2 py-1 text-xs"
              aria-label="Co-pilot model"
            >
              {COPILOT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button onClick={onClose} aria-label="Close co-pilot" className="text-muted hover:text-ink">
              <X size={20} />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-tile border border-sage-100 bg-sage-50 px-4 py-3 text-sm text-ink/80">
            Ask about {student.name}'s progress, adaptations, or what to teach
            next. Answers are grounded in this student's session history.
          </div>

          {turns.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={!ctx || busy}
                  className="text-xs px-3 py-1.5 rounded-full bg-white border border-line hover:bg-sage-50 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {turns.map((t, i) => (
            <ChatBubble key={i} turn={t} />
          ))}

          {(iep.kind === "loading" || iep.kind === "ok" || iep.kind === "error") && (
            <IepCard
              state={iep}
              onDismiss={() => setIep({ kind: "idle" })}
            />
          )}
        </div>

        <footer className="border-t border-line bg-white/70 px-5 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={draftIep}
              disabled={!ctx || busy}
              title={`Generate a structured IEP progress-note draft from the data (uses ${
                COPILOT_MODELS.find((m) => m.id === IEP_MODEL)?.label ?? IEP_MODEL
              })`}
            >
              <FileText size={14} /> Draft IEP progress note
            </Button>
            <span className="text-xs text-muted">
              uses {COPILOT_MODELS.find((m) => m.id === IEP_MODEL)?.label ?? IEP_MODEL}
            </span>
            {busy && (
              <Button size="sm" variant="ghost" onClick={stop}>
                <StopCircle size={14} /> Stop
              </Button>
            )}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) send(input);
                }
              }}
              rows={2}
              placeholder={ctx ? "Ask the co-pilot…" : "Loading session data…"}
              disabled={!ctx || busy}
              className="flex-1 resize-none rounded-tile border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-sage disabled:opacity-50"
            />
            <Button type="submit" size="sm" disabled={!canSend} aria-label="Send">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </form>
        </footer>
      </aside>
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isTeacher = turn.role === "teacher";
  return (
    <div className={isTeacher ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] rounded-tile px-4 py-2.5 text-sm whitespace-pre-wrap " +
          (isTeacher
            ? "bg-sage text-white"
            : turn.error
              ? "bg-coral/10 text-coral border border-coral/30"
              : "bg-white text-ink border border-line")
        }
      >
        {turn.text}
        {turn.streaming && turn.text.length === 0 && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Loader2 size={14} className="animate-spin" /> thinking…
          </span>
        )}
        {turn.streaming && turn.text.length > 0 && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-sage-500 animate-pulse" />
        )}
      </div>
    </div>
  );
}

function IepCard({
  state,
  onDismiss,
}: {
  state:
    | { kind: "loading" }
    | { kind: "ok"; note: IepProgressNote }
    | { kind: "error"; message: string };
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-tile border border-line bg-white shadow-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink inline-flex items-center gap-2">
          <FileText size={16} className="text-sage-600" /> IEP progress note (draft)
        </h3>
        <button onClick={onDismiss} aria-label="Dismiss draft" className="text-muted hover:text-ink">
          <X size={16} />
        </button>
      </div>

      {state.kind === "loading" && (
        <div className="text-sm text-muted inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Drafting from the data…
        </div>
      )}

      {state.kind === "error" && (
        <div className="text-sm text-coral">{state.message}</div>
      )}

      {state.kind === "ok" && (
        <div className="space-y-3 text-sm">
          <ConfidenceBadge level={state.note.dataConfidence} />
          <Section title="Present levels" body={state.note.presentLevels} />
          <Section title="Progress toward goal" body={state.note.progressTowardGoal} />
          <Section title="Recommendation" body={state.note.recommendation} />
          <p className="text-xs text-muted italic border-t border-line pt-2">
            {state.note.caveat}
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted mb-0.5">{title}</div>
      <p className="text-ink whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: "high" | "moderate" | "low" }) {
  const styles: Record<typeof level, string> = {
    high: "bg-sage-50 text-sage-600 border-sage-100",
    moderate: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-coral/10 text-coral border-coral/30",
  };
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${styles[level]}`}
    >
      data confidence: {level}
    </span>
  );
}
