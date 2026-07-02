/**
 * Server-side Anthropic proxy.
 *
 * The whole point of the backend's AI route: the Anthropic API key lives
 * in the server environment (ANTHROPIC_API_KEY), never in the browser.
 * The client sends a system + user prompt; the server makes the call and
 * returns the text. This is the multi-tenant-safe alternative to the
 * direct-from-browser path documented in the app's README.
 */

const ANTHROPIC_VERSION = "2023-06-01";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 30_000;

export interface ProxyParams {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
}

export type ProxyResult =
  | { ok: true; text: string; model: string }
  | { ok: false; status: number; error: string };

export async function proxyAnthropic(
  apiKey: string,
  params: ProxyParams,
): Promise<ProxyResult> {
  if (!apiKey) {
    return { ok: false, status: 503, error: "Server is not configured with an API key." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? 2048,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: `Anthropic returned ${res.status}: ${body.slice(0, 200)}`,
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
      return { ok: false, status: 502, error: "Empty response from Anthropic." };
    }
    return { ok: true, text, model: json.model ?? params.model ?? DEFAULT_MODEL };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, status: 504, error: "Anthropic request timed out." };
    }
    return { ok: false, status: 502, error: (err as Error).message ?? "Network error." };
  } finally {
    clearTimeout(timer);
  }
}

export type StreamResult =
  | { ok: true; stream: AsyncIterable<string> }
  | { ok: false; status: number; error: string };

/**
 * Streaming variant: opens an Anthropic SSE stream and returns it as an
 * async-iterable of RAW text chunks. The route relays these straight to the
 * browser, where the single SSE parser (src/ai/sseParser.ts) owns the wire
 * format. The key still never leaves the server.
 */
export async function streamAnthropic(
  apiKey: string,
  params: ProxyParams,
): Promise<StreamResult> {
  if (!apiKey) {
    return { ok: false, status: 503, error: "Server is not configured with an API key." };
  }
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? 2048,
        stream: true,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      }),
    });
  } catch (err) {
    return { ok: false, status: 502, error: (err as Error).message ?? "Network error." };
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status || 502,
      error: `Anthropic returned ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const stream: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
    },
  };
  return { ok: true, stream };
}
