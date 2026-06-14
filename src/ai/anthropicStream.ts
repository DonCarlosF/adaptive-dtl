/**
 * Streaming Anthropic Messages call.
 *
 * Mirrors `anthropicClient.callAnthropic`'s typed-result shape but streams
 * tokens via an `onToken` callback as they arrive, returning the final
 * accumulated text + model when the stream completes.
 *
 * Two transports, chosen automatically:
 *   - browser-direct: POST to api.anthropic.com with the teacher's key and
 *     the `anthropic-dangerous-direct-browser-access` header (local-first
 *     default, same as the non-streaming client).
 *   - backend-proxied: when cloud mode is on, POST to `/api/ai/stream` with
 *     the JWT; the server holds the Anthropic key and relays the SSE.
 *
 * Loaded on demand via dynamic import so the streaming/co-pilot code stays
 * out of the dashboard's initial chunk (see BUNDLE.md).
 */

import { AnthropicError } from "./anthropicErrors";
import { DEFAULT_AI_MODEL } from "./anthropicClient";
import { SSEParser } from "./sseParser";
import { apiBaseUrl, authHeader, isCloudEnabled } from "@/api/client";

const ANTHROPIC_VERSION = "2023-06-01";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
/** Generous: streaming is for long co-pilot answers; we cap idle, not total. */
const IDLE_TIMEOUT_MS = 60_000;

export interface StreamResult {
  text: string;
  model: string;
  stopReason?: string;
}

export interface StreamParams {
  /** Required for the browser-direct path; ignored when proxying. */
  apiKey?: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  /** Called with each text fragment as it streams in. */
  onToken?: (fragment: string) => void;
  /** Abort the stream early (e.g. user closed the drawer). */
  signal?: AbortSignal;
}

type StreamOutcome =
  | { ok: true; result: StreamResult }
  | { ok: false; error: AnthropicError };

/**
 * Run a streaming Messages request. Accumulates text, invokes `onToken` per
 * fragment, and resolves with the final result or a typed error.
 */
export async function streamAnthropic(params: StreamParams): Promise<StreamOutcome> {
  const cloud = isCloudEnabled();
  if (!cloud && !params.apiKey) return { ok: false, error: { kind: "no-key" } };

  // Idle-timeout: reset on every chunk so a long-but-active stream isn't
  // killed, but a wedged connection is. Composed with the caller's signal.
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  params.signal?.addEventListener("abort", onAbort);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT_MS);
  };

  const body = JSON.stringify({
    model: params.model ?? DEFAULT_AI_MODEL,
    max_tokens: params.maxTokens ?? 2048,
    stream: true,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt }],
  });

  try {
    armIdle();
    const res = cloud
      ? await fetch(`${apiBaseUrl()}/api/ai/stream`, {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", ...authHeader() },
          body,
        })
      : await fetch(ENDPOINT, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": params.apiKey!,
            "anthropic-version": ANTHROPIC_VERSION,
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body,
        });

    const httpError = classifyHttpError(res.status);
    if (httpError) {
      if (res.status >= 400) {
        const detail = await res.text().catch(() => "");
        if (httpError.kind === "bad-response" && detail) {
          httpError.message = `${httpError.message}: ${detail.slice(0, 200)}`;
        }
      }
      return { ok: false, error: httpError };
    }
    if (!res.body) {
      return { ok: false, error: { kind: "bad-response", message: "No response stream." } };
    }

    const parser = new SSEParser();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let model = params.model ?? DEFAULT_AI_MODEL;
    let stopReason: string | undefined;
    let streamErr: { type: string; message: string } | undefined;

    const consume = (deltas: ReturnType<SSEParser["push"]>) => {
      for (const d of deltas) {
        if (d.model) model = d.model;
        if (d.stopReason) stopReason = d.stopReason;
        if (d.error) streamErr = d.error;
        if (d.text) {
          text += d.text;
          params.onToken?.(d.text);
        }
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      consume(parser.push(decoder.decode(value, { stream: true })));
    }
    consume(parser.flush());

    if (streamErr) {
      return {
        ok: false,
        error: { kind: "bad-response", message: streamErr.message },
      };
    }
    if (!text.trim()) {
      return { ok: false, error: { kind: "bad-response", message: "Empty response." } };
    }
    return { ok: true, result: { text, model, stopReason } };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      // Distinguish caller-cancel from idle-timeout: a caller abort is not an
      // error worth surfacing, but we still report timeout so the UI can show it.
      if (params.signal?.aborted) {
        return { ok: false, error: { kind: "network", message: "Cancelled." } };
      }
      return { ok: false, error: { kind: "timeout" } };
    }
    return {
      ok: false,
      error: { kind: "network", message: (err as Error).message ?? "Network error." },
    };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    params.signal?.removeEventListener("abort", onAbort);
  }
}

function classifyHttpError(status: number): AnthropicError | null {
  if (status === 401 || status === 403) {
    return { kind: "auth", message: "API key was rejected. Check it in Settings." };
  }
  if (status === 429) {
    return { kind: "rate-limit", message: "Rate limited. Try again in a minute." };
  }
  if (status >= 400) {
    return { kind: "bad-response", message: `Anthropic returned ${status}` };
  }
  return null;
}
