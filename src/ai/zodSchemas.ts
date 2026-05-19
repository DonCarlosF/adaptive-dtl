import { z } from "zod";

/**
 * Zod schemas for the activity-generation response.
 *
 * Validation runs before any caching or session use. A malformed response
 * is rejected without retry — the caller falls back to hand-authored
 * content. This keeps spend bounded and behavior honest.
 */

export const aiTrialSchema = z.object({
  prompt: z.string().min(3).max(160),
  correctChoiceId: z.string().min(1).max(64),
  distractorChoiceIds: z.array(z.string().min(1).max(64)).min(1).max(3),
  difficulty: z.number().int().min(1).max(3).optional(),
});

export const aiResponseSchema = z.object({
  trials: z.array(aiTrialSchema).min(4).max(20),
});

export type AITrial = z.infer<typeof aiTrialSchema>;
export type AIResponse = z.infer<typeof aiResponseSchema>;
