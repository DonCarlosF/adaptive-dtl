/**
 * Cloud AI path: call the backend's Anthropic proxy instead of calling
 * Anthropic directly from the browser. Returns the same shape as
 * `callAnthropic` so activityGenerator can use either interchangeably.
 * The API key never touches the client in this path.
 */
import { apiFetch, ApiError } from "./client";
import type { AnthropicError } from "@/ai/anthropicErrors";
import type { AnthropicCallResult } from "@/ai/anthropicClient";

interface ProxyArgs {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
}

export async function callViaProxy(
  args: ProxyArgs,
): Promise<
  { ok: true; result: AnthropicCallResult } | { ok: false; error: AnthropicError }
> {
  try {
    const res = await apiFetch<{ text: string; model: string }>(
      "/api/ai/messages",
      { method: "POST", body: args },
    );
    return { ok: true, result: { text: res.text, model: res.model } };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, error: mapStatusToError(e.status, e.message) };
    }
    return { ok: false, error: { kind: "network", message: (e as Error).message } };
  }
}

function mapStatusToError(status: number, message: string): AnthropicError {
  switch (status) {
    case 401:
    case 403:
      // The teacher's session expired — surface as a generic failure.
      return { kind: "auth", message };
    case 429:
      return { kind: "rate-limit", message };
    case 503:
      return { kind: "no-key" };
    case 504:
      return { kind: "timeout" };
    default:
      return { kind: "bad-response", message };
  }
}
