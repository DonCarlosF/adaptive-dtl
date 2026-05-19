/**
 * Direct-from-browser Anthropic Messages API call.
 *
 * The user provides their own key, stored locally in IndexedDB. We use
 * the `anthropic-dangerous-direct-browser-access` header so the request
 * is allowed cross-origin without a backend.
 *
 * Caller is responsible for caching. This module only does one thing:
 * make the call and surface a typed error union.
 *
 * Loaded on demand via `await import("@/ai/anthropicClient")` inside
 * `requestAIGeneration` so that views that don't generate (the student
 * session, the dashboard) don't pull this code into their chunks.
 */

import { AnthropicError } from "./anthropicErrors";

export const DEFAULT_AI_MODEL = "claude-sonnet-4-6";

const ANTHROPIC_VERSION = "2023-06-01";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 30_000;

export interface AnthropicCallResult {
  /** Concatenated text content from the response. */
  text: string;
  model: string;
}

interface CallParams {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
}

export async function callAnthropic(
  params: CallParams,
): Promise<{ ok: true; result: AnthropicCallResult } | { ok: false; error: AnthropicError }> {
  if (!params.apiKey) return { ok: false, error: { kind: "no-key" } };

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": params.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: params.model ?? DEFAULT_AI_MODEL,
        max_tokens: params.maxTokens ?? 2048,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: {
          kind: "auth",
          message: "API key was rejected. Check it in Settings.",
        },
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        error: { kind: "rate-limit", message: "Rate limited. Try again in a minute." },
      };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: {
          kind: "bad-response",
          message: `Anthropic returned ${res.status}: ${body.slice(0, 200)}`,
        },
      };
    }

    const json = (await res.json()) as {
      model?: string;
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text.trim()) {
      return { ok: false, error: { kind: "bad-response", message: "Empty response." } };
    }
    return {
      ok: true,
      result: { text, model: json.model ?? params.model ?? DEFAULT_AI_MODEL },
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: { kind: "timeout" } };
    }
    return {
      ok: false,
      error: {
        kind: "network",
        message: (err as Error).message ?? "Network error.",
      },
    };
  } finally {
    window.clearTimeout(timer);
  }
}
