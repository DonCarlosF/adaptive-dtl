/**
 * Prompts and structured-output schema for the teacher co-pilot.
 *
 * Two modes:
 *   1. Free-form Q&A grounded in a student's session history (chat).
 *   2. A strict IEP progress-note draft validated by zod before display.
 *
 * Prompt builders are pure functions of the rendered context brief so they
 * can be unit-tested without touching the network.
 */

import { z } from "zod";
import { CopilotContext, renderContextBrief } from "./copilotContext";

/** System prompt for the conversational co-pilot. */
export const COPILOT_SYSTEM_PROMPT = `You are a co-pilot for a Mod SDC special education teacher in an elementary classroom. You help the teacher interpret a student's discrete-trial learning (DTL) data and plan instruction.

Ground every answer in the data brief provided. When the data is thin or absent, say so plainly rather than inventing trends. You are a thinking partner, not an oracle:

- Be concrete and classroom-actionable. Prefer "try reducing the field to two choices for stop-sign trials" over "consider scaffolding."
- Quantify with the numbers in the brief; never fabricate percentages or sessions that aren't there.
- Respect the student. No deficit-laden language; describe what the student can do and what to teach next.
- Keep it brief. A few short paragraphs or a tight list. This is a quick consult between sessions, not a report.
- You are not a clinician. Do not diagnose. Flag when something warrants the IEP team's attention rather than asserting it.`;

/** Build the grounding turn for a chat question. */
export function buildCopilotUserPrompt(
  ctx: CopilotContext,
  question: string,
): string {
  return `Here is the current data brief for the student:

${renderContextBrief(ctx)}

---

Teacher's question: ${question.trim()}`;
}

/**
 * Zod schema for a structured IEP progress note. Mirrors the three standard
 * sections of a progress note plus a confidence flag. Validated before the
 * draft is ever shown — a malformed model response is rejected, not rendered.
 */
export const iepProgressNoteSchema = z.object({
  /** Present levels of performance — what the student can currently do. */
  presentLevels: z.string().min(20).max(1200),
  /** Progress toward the goal, with the data that supports it. */
  progressTowardGoal: z.string().min(20).max(1200),
  /** A measurable, data-grounded recommendation for the next period. */
  recommendation: z.string().min(20).max(1200),
  /**
   * Model's own read on whether the data is sufficient to support this note.
   * Surfaced to the teacher so a thin-data draft is flagged, not trusted.
   */
  dataConfidence: z.enum(["high", "moderate", "low"]),
  /** One-line caveat about the limits of this draft. */
  caveat: z.string().min(5).max(400),
});

export type IepProgressNote = z.infer<typeof iepProgressNoteSchema>;

/** System prompt for the IEP-draft mode. */
export const IEP_SYSTEM_PROMPT = `You draft IEP progress-note language for a special education teacher, grounded strictly in discrete-trial learning data. You produce a DRAFT the teacher will review and edit — never a final record.

Return STRICT JSON in exactly this shape, with no prose around it:

{
  "presentLevels": "string",
  "progressTowardGoal": "string",
  "recommendation": "string",
  "dataConfidence": "high" | "moderate" | "low",
  "caveat": "string"
}

Rules:
- Use only the data in the brief. Cite the actual accuracy figures, session counts, and adaptation events; do not invent any.
- "presentLevels" describes what the student currently does across the goal areas.
- "progressTowardGoal" states the trajectory using the trend and numbers in the brief.
- "recommendation" is one concrete, measurable next step (e.g. a target accuracy or field size), tied to the data.
- "dataConfidence" reflects how much session data backs the note: "low" when there are few sessions or no clear trend.
- "caveat" is a single sentence reminding the reader this is an AI-assisted draft to be verified against the IEP goal and team judgment.
- Write in professional, strengths-based, non-diagnostic language. Output only the JSON object.`;

/** Build the IEP-draft user turn. */
export function buildIepUserPrompt(ctx: CopilotContext): string {
  return `Draft an IEP progress note from this discrete-trial learning data brief:

${renderContextBrief(ctx)}

Return only the JSON object.`;
}

/**
 * Parse + validate a raw model response into an IepProgressNote. Tolerates
 * stray prose around the JSON object (same approach as the activity
 * generator). Returns a typed ok/err so the UI can show a clean failure.
 */
export function parseIepNote(
  text: string,
): { ok: true; note: IepProgressNote } | { ok: false; message: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, message: "No JSON object in response." };
  }
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, message: `Invalid JSON: ${(e as Error).message}` };
  }
  const result = iepProgressNoteSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, note: result.data };
}
