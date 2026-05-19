/**
 * Activity generator.
 *
 * In pass 2 this module:
 *   1. Hits the Anthropic Messages API with a domain-specific prompt.
 *   2. Validates the response with zod before any persistence.
 *   3. Caches by (studentId, domain, contentHash) so identical prompts
 *      don't re-fire the call.
 *   4. Falls back to hand-authored content on any error, with a typed
 *      reason the caller can surface to the teacher.
 *
 * The pass-1 function `generateTrials(domain, readingLevel, opts)` keeps
 * its signature — it now optionally consults the AI cache when given
 * `opts.studentId`. Two new exports do the AI-specific work:
 *
 *   loadTrialsForSession(domain, student) → { templates, source }
 *   requestAIGeneration(domain, student, settings) → typed result
 */

import {
  DomainId,
  ReadingLevel,
  SessionRecord,
  StudentProfile,
  TrialTemplate,
} from "@/engine/types";
import { AIItem, getDomain } from "@/domains/registry";
import { aiGeneratedRepo, makeId } from "@/db/aiGeneratedRepo";
import { sessionRepo } from "@/db/sessionRepo";
import { buildUserPrompt, SYSTEM_PROMPT } from "./promptTemplates";
import { aiResponseSchema, AITrial } from "./zodSchemas";
import type { AnthropicError } from "./anthropicErrors";
import { contentHash } from "./contentHash";

export interface GenerateOptions {
  /** Anthropic API key from settings; required for AI generation. */
  apiKey?: string;
  /** Optional teacher note to shape the generation. */
  profileNote?: string;
  /** Student id — when present, AI cache is consulted. */
  studentId?: string;
}

/**
 * Pass-1 compatible: returns trial templates for a domain.
 *
 * If `opts.studentId` is provided, returns the most recent AI-generated
 * set for that student in this domain when one exists. Otherwise returns
 * the hand-authored fallback. Never makes an API call — call
 * `requestAIGeneration` for that.
 */
export async function generateTrials(
  domain: DomainId,
  readingLevel: ReadingLevel,
  opts: GenerateOptions = {},
): Promise<TrialTemplate[]> {
  if (opts.studentId) {
    const cached = await aiGeneratedRepo.latestFor(opts.studentId, domain);
    if (cached) return cached.templates;
  }
  return getDomain(domain).buildTrials(readingLevel);
}

export interface LoadResult {
  templates: TrialTemplate[];
  source: "ai" | "authored";
  /** When source = "ai", when this set was generated. */
  generatedAt?: number;
}

/**
 * Load the templates the StudentSession should use for a given student.
 * Returns a `source` so the session can be tagged in the dashboard.
 */
export async function loadTrialsForSession(
  domain: DomainId,
  student: StudentProfile,
): Promise<LoadResult> {
  const cached = await aiGeneratedRepo.latestFor(student.id, domain);
  if (cached) {
    return {
      templates: cached.templates,
      source: "ai",
      generatedAt: cached.generatedAt,
    };
  }
  return {
    templates: getDomain(domain).buildTrials(student.readingLevel),
    source: "authored",
  };
}

export type GenerationOutcome =
  | {
      ok: true;
      templates: TrialTemplate[];
      cached: boolean;
      generatedAt: number;
      model: string;
    }
  | { ok: false; error: AnthropicError | { kind: "validation"; message: string } };

/**
 * Run the AI generation flow for one (student, domain). Validates,
 * caches, and returns a typed outcome.
 *
 * If a cached set already exists for the same content hash, returns it
 * without firing a network call. This is the budget-protector.
 */
export async function requestAIGeneration(
  domain: DomainId,
  student: StudentProfile,
  apiKey: string,
  trialCount = 8,
): Promise<GenerationOutcome> {
  if (!apiKey) return { ok: false, error: { kind: "no-key" } };

  const ctx = await buildContext(domain, student, trialCount);
  const userPrompt = buildUserPrompt(ctx);
  const hash = contentHash(`${SYSTEM_PROMPT}\n---\n${userPrompt}`);

  const existing = await aiGeneratedRepo.byKey(student.id, domain, hash);
  if (existing) {
    return {
      ok: true,
      templates: existing.templates,
      cached: true,
      generatedAt: existing.generatedAt,
      model: existing.model,
    };
  }

  // Dynamic import: keeps the Anthropic fetch wrapper out of any chunk
  // that doesn't generate (the student session, the dashboard).
  const { callAnthropic, DEFAULT_AI_MODEL: DEFAULT_MODEL } = await import(
    "./anthropicClient"
  );
  const call = await callAnthropic({
    apiKey,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  });
  if (!call.ok) return { ok: false, error: call.error };

  const parsed = parseResponse(call.result.text);
  if (!parsed.ok) {
    return { ok: false, error: { kind: "validation", message: parsed.message } };
  }

  const templates = aiTrialsToTemplates(parsed.trials, domain);
  if (templates.length < 4) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "All trials referenced unknown items — rejected.",
      },
    };
  }

  const generatedAt = Date.now();
  await aiGeneratedRepo.save({
    id: makeId(student.id, domain, hash),
    studentId: student.id,
    domain,
    contentHash: hash,
    model: call.result.model,
    templates,
    generatedAt,
  });

  return {
    ok: true,
    templates,
    cached: false,
    generatedAt,
    model: call.result.model ?? DEFAULT_MODEL,
  };
}

async function buildContext(
  domain: DomainId,
  student: StudentProfile,
  trialCount: number,
) {
  const sessions = await sessionRepo.listForStudentAndDomain(student.id, domain);
  const recent = sessions.slice(-5);
  const flatTrials = recent.flatMap((s) => s.trials);
  const recentAccuracy =
    flatTrials.length === 0
      ? null
      : flatTrials.filter((t) => t.correct).length / flatTrials.length;

  const dom = getDomain(domain);
  const labelById = new Map(dom.availableForAI().map((it) => [it.id, it.label]));
  const correctIds = new Set<string>();
  const missedIds = new Set<string>();
  for (const t of flatTrials) {
    const itemId = inferItemIdFromTemplateId(t.templateId);
    if (!itemId || !labelById.has(itemId)) continue;
    if (t.correct) correctIds.add(itemId);
    else missedIds.add(itemId);
  }

  const recentlyCorrect: AIItem[] = [...correctIds].map((id) => ({
    id,
    label: labelById.get(id)!,
  }));
  const recentlyMissed: AIItem[] = [...missedIds].map((id) => ({
    id,
    label: labelById.get(id)!,
  }));

  return {
    domain,
    readingLevel: student.readingLevel,
    studentName: student.name,
    profileNote: student.note,
    recentAccuracy,
    recentlyCorrect,
    recentlyMissed,
    trialCount,
  };
}

/**
 * Map our pass-1 templateId formats back to an item id when possible.
 * Format examples:
 *   sw-w-the           → w-the (sight words: drop the leading "sw-")
 *   sg-s-stop-3        → s-stop  (community signs: drop "sg-" prefix and trailing index)
 *   mn-m-quarter-7     → m-quarter
 * Returns null when the templateId doesn't match a known shape (e.g.
 * seeded fake data uses opaque IDs).
 */
function inferItemIdFromTemplateId(tplId: string): string | null {
  const m = tplId.match(/^(sw|mn|sg)-(.+?)(?:-\d+)?$/);
  if (!m) return null;
  return m[2];
}

function parseResponse(
  text: string,
): { ok: true; trials: AITrial[] } | { ok: false; message: string } {
  // Tolerate stray prose around the JSON object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, message: "No JSON object in response." };
  }
  const slice = text.slice(start, end + 1);
  let json: unknown;
  try {
    json = JSON.parse(slice);
  } catch (e) {
    return { ok: false, message: `Invalid JSON: ${(e as Error).message}` };
  }
  const result = aiResponseSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, trials: result.data.trials };
}

function aiTrialsToTemplates(
  aiTrials: AITrial[],
  domain: DomainId,
): TrialTemplate[] {
  const dom = getDomain(domain);
  const out: TrialTemplate[] = [];
  let i = 0;
  for (const t of aiTrials) {
    if (!dom.isValidChoiceId(t.correctChoiceId)) continue;
    const distractors = t.distractorChoiceIds.filter((id) =>
      dom.isValidChoiceId(id),
    );
    if (distractors.length < 1) continue;
    const choiceIds = uniq([t.correctChoiceId, ...distractors]);
    out.push({
      id: `ai-${domain}-${i++}-${Date.now().toString(36)}`,
      prompt: t.prompt,
      correctChoiceId: t.correctChoiceId,
      choiceIds,
      difficulty: clampDifficulty(t.difficulty),
    });
  }
  return out;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function clampDifficulty(d?: number): 1 | 2 | 3 | undefined {
  if (d === 1 || d === 2 || d === 3) return d;
  return undefined;
}

/**
 * Helper for the dashboard "AI" chip — does this session use AI templates?
 * Read off the SessionRecord directly; this is here in case the caller
 * has only the record handy.
 */
export function isAISession(s: SessionRecord): boolean {
  return s.aiGenerated === true;
}
