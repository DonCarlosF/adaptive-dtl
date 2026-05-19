import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import {
  DomainId,
  DOMAIN_LABELS,
  ReadingLevel,
  ResponseMethod,
  StudentProfile,
} from "@/engine/types";

const AVATARS = ["🦊", "🦋", "🐉", "🦉", "🐢", "🦒", "🐙", "🦔", "🌻", "🌟", "🐳", "🦦"];
const READING_LEVELS: ReadingLevel[] = ["PreK", "K", "1st", "2nd"];
const GOALS: DomainId[] = ["sightWords", "moneyId", "communitySigns"];
const METHODS: ResponseMethod[] = ["touch", "eye gaze", "both"];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (s: StudentProfile) => void;
}

export function AddStudentModal({ open, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🦊");
  const [grade, setGrade] = useState("3rd");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("K");
  const [goals, setGoals] = useState<DomainId[]>(["sightWords"]);
  const [responseMethod, setResponseMethod] = useState<ResponseMethod>("touch");
  const [lowStim, setLowStim] = useState(false);
  const [attentionBaselineMin, setAttention] = useState(3);
  const [note, setNote] = useState("");

  const canSave = name.trim().length > 0 && goals.length > 0;

  const reset = () => {
    setName("");
    setAvatar("🦊");
    setGrade("3rd");
    setReadingLevel("K");
    setGoals(["sightWords"]);
    setResponseMethod("touch");
    setLowStim(false);
    setAttention(3);
    setNote("");
  };

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: `stu-${Date.now()}`,
      name: name.trim(),
      avatar,
      grade,
      readingLevel,
      goals,
      responseMethod,
      lowStim,
      attentionBaselineMin,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    });
    reset();
    onClose();
  };

  const toggleGoal = (g: DomainId) =>
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  return (
    <Modal open={open} onClose={onClose} title="Add a student" widthClass="max-w-xl">
      <div className="space-y-5">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            className="w-full rounded-xl border border-line bg-white px-3 py-2 focus:outline-none focus:border-sage"
            autoFocus
          />
        </Field>

        <Field label="Avatar">
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={
                  "w-11 h-11 rounded-full text-2xl border " +
                  (avatar === a
                    ? "border-sage bg-sage-50"
                    : "border-line bg-white hover:bg-sage-50")
                }
                aria-label={`Avatar ${a}`}
              >
                {a}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Grade">
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2"
            >
              {["3rd", "4th", "5th"].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Reading level">
            <select
              value={readingLevel}
              onChange={(e) => setReadingLevel(e.target.value as ReadingLevel)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2"
            >
              {READING_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Active goal areas">
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => toggleGoal(g)}
                className={
                  "px-3 py-2 rounded-full text-sm border " +
                  (goals.includes(g)
                    ? "border-sage bg-sage-50 text-ink"
                    : "border-line bg-white text-muted hover:bg-sage-50")
                }
              >
                {DOMAIN_LABELS[g]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Response method">
            <select
              value={responseMethod}
              onChange={(e) => setResponseMethod(e.target.value as ResponseMethod)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Low-stim mode">
            <label className="inline-flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={lowStim}
                onChange={(e) => setLowStim(e.target.checked)}
                className="w-5 h-5 accent-sage-500"
              />
              <span className="text-sm text-muted">Suppress reinforcer animation</span>
            </label>
          </Field>
        </div>

        <Field label={`Attention baseline: ${attentionBaselineMin} min`}>
          <input
            type="range"
            min={1}
            max={10}
            value={attentionBaselineMin}
            onChange={(e) => setAttention(Number(e.target.value))}
            className="w-full accent-sage-500"
          />
        </Field>

        <Field label="Note (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything a paraprofessional should know before running an activity."
            rows={3}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 focus:outline-none focus:border-sage resize-none"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSave}>Save student</Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-ink mb-1.5">{label}</div>
      {children}
    </label>
  );
}
