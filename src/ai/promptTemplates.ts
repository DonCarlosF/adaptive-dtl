/**
 * Prompt templates for the activity generator.
 *
 * The system prompt frames Claude as a co-author working with a Mod SDC
 * teacher, not a content factory. The user prompt is composed per call
 * with the student's profile and recent per-item performance.
 *
 * Output format is a strict JSON object with a `trials` array, validated
 * by zod in `activityGenerator.ts`. Anything that doesn't validate is
 * rejected without retry — an honest failure is better than a malformed
 * trial reaching a student.
 */

import { DomainId, ReadingLevel } from "@/engine/types";
import { AIItem, getDomain } from "@/domains/registry";

export interface PromptContext {
  domain: DomainId;
  readingLevel: ReadingLevel;
  studentName: string;
  /** Free-text teacher note from the student profile. */
  profileNote?: string;
  /** Overall recent accuracy in this domain (0..1) — short-window. */
  recentAccuracy: number | null;
  /** Items the student has answered correctly recently. */
  recentlyCorrect: AIItem[];
  /** Items the student has missed recently. */
  recentlyMissed: AIItem[];
  /** How many trials to ask for. */
  trialCount: number;
}

export const SYSTEM_PROMPT = `You are co-authoring discrete-trial learning activities with a Mod SDC special education teacher in a 3rd–5th grade classroom in Oakland, California. Your job is to produce trial sets that are:

- Age-appropriate for elementary students with significant cognitive disabilities.
- Functional. Skills should be usable in daily life — buying snacks at a corner store, finding the right restroom, recognizing a stop sign. Never decorative.
- Plain. No irony, no sarcasm, no pop-culture references — many of these students do not generalize cultural shorthand.
- Errorless-friendly. Distractors must be plausibly different from the target. Don't pick adversarial near-misses (e.g. "was" vs "saw", "on" vs "no") — those are research targets, not first-line drill.

You return STRICT JSON in this exact shape, with no prose around it:

{
  "trials": [
    {
      "prompt": "Touch the word the.",
      "correctChoiceId": "<id>",
      "distractorChoiceIds": ["<id>", "<id>", "<id>"],
      "difficulty": 1
    }
  ]
}

Rules:
- "difficulty" is 1, 2, or 3 (1 = easiest).
- Every id you return must come from the "Allowed item ids" list in the user prompt, OR — for the sightWords domain only — you may invent new word ids using the format "aiword:<word>" (lowercase, ASCII letters only, no spaces).
- Each trial needs at least one distractor id; up to three. The engine picks how many to display per trial based on the student's level.
- Do not repeat the same correctChoiceId across trials.
- Do not include any text outside the JSON object.`;

export function buildUserPrompt(ctx: PromptContext): string {
  const dom = getDomain(ctx.domain);
  const allowed = dom.availableForAI();

  const allowedList = allowed
    .map((it) => `  - ${it.id}: "${it.label}"`)
    .join("\n");

  const accuracySection =
    ctx.recentAccuracy == null
      ? "No recent session data yet."
      : `Recent overall accuracy in this domain: ${Math.round(
          ctx.recentAccuracy * 100,
        )}%.`;

  const recentlyCorrect =
    ctx.recentlyCorrect.length > 0
      ? ctx.recentlyCorrect.map((i) => `"${i.label}"`).join(", ")
      : "(none recorded)";
  const recentlyMissed =
    ctx.recentlyMissed.length > 0
      ? ctx.recentlyMissed.map((i) => `"${i.label}"`).join(", ")
      : "(none recorded)";

  const domainGuidance = DOMAIN_GUIDANCE[ctx.domain];

  return `Domain: ${ctx.domain}
Student: ${ctx.studentName}
Reading level: ${ctx.readingLevel}
${ctx.profileNote ? `Teacher note: ${ctx.profileNote}` : ""}

${accuracySection}
Recently mastered (de-prioritize as targets, fine as distractors): ${recentlyCorrect}
Recently missed (good targets to revisit, but spread across the set): ${recentlyMissed}

Allowed item ids:
${allowedList}

${domainGuidance}

Produce exactly ${ctx.trialCount} trials. Return only the JSON object.`;
}

const DOMAIN_GUIDANCE: Record<DomainId, string> = {
  sightWords: `Sight Words guidance:
- Targets must be at or one level below the student's reading level.
- Vary prompt wording across the set: "Touch the word X.", "Find the word X.", "Show me X.".
- You may introduce new Dolch-list-appropriate words using "aiword:<word>" ids, but at least half of the targets should reuse the allowed ids so the set remains comparable to past sessions.`,

  moneyId: `Money ID guidance:
- Use only the allowed ids (the SVG inventory is fixed). New money items cannot be rendered.
- Mix coin and bill targets. Vary prompt wording.
- Distractors should be visually distinct (don't pair penny/nickel as the only two distractors of a quarter).`,

  communitySigns: `Community Signs guidance:
- Use only the allowed ids (the SVG inventory is fixed).
- Bias targets toward safety-critical signs (stop, don't walk, danger) and high-frequency-in-Oakland signs (restroom, exit).
- Prompts should describe the sign's MEANING, not its shape — e.g. "Touch the sign that means STOP", not "Touch the red octagon".`,

  // --- domains-expansion ---
  timeTelling: `Time Telling guidance:
- Use only the allowed ids (the clock renderer is fixed — it can only draw o'clock and half-past times). New times cannot be rendered.
- Prompts should name the TIME the student must find — e.g. "Touch the clock that shows 3 o'clock." or "Find the clock that shows half past 6." — never describe hand positions.
- Favor o'clock targets unless the student is already accurate with them; introduce half-past sparingly and never as the only distractor of the same hour (3:00 vs half past 3 is a near-miss, not first-line drill).
- Distractors should sit at clearly different hand positions (e.g. 3 o'clock vs 9 o'clock, not 3 vs 4).`,

  emotions: `Emotions guidance:
- Use only the allowed ids (the face illustrations are fixed). New emotions cannot be rendered.
- Prompts should name the FEELING — e.g. "Touch the person who feels happy." — plain words, no scenarios, no idioms.
- Don't pair visually similar expressions as each other's only distractor early on (scared vs surprised, tired vs calm); contrast a target with clearly different feelings first.
- Bias targets toward the core regulation words the student uses about themselves during the school day: happy, sad, angry, calm.`,
  // --- end domains-expansion ---
};
