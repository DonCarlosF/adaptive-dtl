/**
 * Incremental Server-Sent Events parser for the Anthropic Messages API
 * streaming format (`stream: true`).
 *
 * Kept in its own module — with no `fetch` or DOM dependency — so it can be
 * unit-tested by feeding synthetic chunks, and reused by both the
 * browser-direct and backend-proxied streaming paths.
 *
 * The Messages stream is a sequence of SSE events:
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}
 *
 * We only need the text: accumulate `content_block_delta` events whose delta
 * is a `text_delta`. We also surface the model from `message_start` and the
 * stop reason from `message_delta`, and propagate a streamed `error` event.
 */

export interface StreamDelta {
  /** A text fragment to append (from a text_delta). */
  text?: string;
  /** Model id, present once at message_start. */
  model?: string;
  /** Stop reason, present at message_delta near the end. */
  stopReason?: string;
  /** A streamed error event (e.g. overloaded mid-stream). */
  error?: { type: string; message: string };
}

/**
 * Stateful line-oriented SSE parser. Feed it raw decoded text in any
 * chunking; it emits a `StreamDelta` per complete `data:` JSON payload.
 *
 * SSE frames are separated by blank lines, but the Anthropic stream sends one
 * JSON object per `data:` line, so we can parse each `data:` line eagerly
 * without waiting for the frame boundary. We still buffer partial lines.
 */
export class SSEParser {
  private buffer = "";

  /**
   * Push a chunk of decoded text. Returns the deltas parsed from any complete
   * lines in this chunk (may be empty).
   */
  push(chunk: string): StreamDelta[] {
    this.buffer += chunk;
    const out: StreamDelta[] = [];

    // Split on newlines; keep the trailing partial line in the buffer.
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      const delta = this.parseLine(line);
      if (delta) out.push(delta);
    }
    return out;
  }

  /** Flush any buffered final line (no trailing newline). */
  flush(): StreamDelta[] {
    if (this.buffer.length === 0) return [];
    const line = this.buffer.replace(/\r$/, "");
    this.buffer = "";
    const delta = this.parseLine(line);
    return delta ? [delta] : [];
  }

  private parseLine(line: string): StreamDelta | null {
    // We ignore `event:` lines, comments (`:` keep-alives), and blanks —
    // the JSON payload's own `type` field tells us everything we need.
    if (!line.startsWith("data:")) return null;
    const json = line.slice("data:".length).trim();
    if (!json || json === "[DONE]") return null;

    let evt: AnthropicStreamEvent;
    try {
      evt = JSON.parse(json) as AnthropicStreamEvent;
    } catch {
      // A malformed data line is dropped rather than aborting the stream;
      // the final result will simply be missing that fragment.
      return null;
    }

    switch (evt.type) {
      case "message_start":
        return { model: evt.message?.model };
      case "content_block_delta":
        if (evt.delta?.type === "text_delta" && typeof evt.delta.text === "string") {
          return { text: evt.delta.text };
        }
        return null;
      case "message_delta":
        return evt.delta?.stop_reason
          ? { stopReason: evt.delta.stop_reason }
          : null;
      case "error":
        return {
          error: {
            type: evt.error?.type ?? "stream_error",
            message: evt.error?.message ?? "Stream error.",
          },
        };
      default:
        // message_stop, content_block_start/stop, ping — nothing to surface.
        return null;
    }
  }
}

/** Minimal typing of the stream events we care about. */
interface AnthropicStreamEvent {
  type: string;
  message?: { model?: string };
  delta?: { type?: string; text?: string; stop_reason?: string };
  error?: { type?: string; message?: string };
}
