import { describe, it, expect } from "vitest";
import { SSEParser } from "./sseParser";

/** Collect the text fragments from a list of deltas. */
function texts(deltas: ReturnType<SSEParser["push"]>): string[] {
  return deltas.filter((d) => d.text !== undefined).map((d) => d.text!);
}

describe("SSEParser", () => {
  it("accumulates text_delta fragments across complete lines", () => {
    const p = new SSEParser();
    const out = [
      ...p.push(
        'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-6"}}\n',
      ),
      ...p.push(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n',
      ),
      ...p.push(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":", world"}}\n',
      ),
    ];
    expect(texts(out).join("")).toBe("Hello, world");
    expect(out.find((d) => d.model)?.model).toBe("claude-sonnet-4-6");
  });

  it("handles a payload split across chunk boundaries mid-line", () => {
    const p = new SSEParser();
    // The JSON for one event arrives in three pieces, no newline until the end.
    const a = p.push('data: {"type":"content_block_delta","delta":{"type":');
    const b = p.push('"text_delta","text":"split"}}');
    const c = p.push("\n");
    expect(texts(a)).toEqual([]);
    expect(texts(b)).toEqual([]);
    expect(texts(c)).toEqual(["split"]);
  });

  it("ignores event/comment/blank lines and [DONE]", () => {
    const p = new SSEParser();
    const out = p.push(
      [
        "event: ping",
        ": keep-alive comment",
        "",
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}',
        "data: [DONE]",
        "",
      ].join("\n") + "\n",
    );
    expect(texts(out)).toEqual(["x"]);
  });

  it("ignores non-text deltas (e.g. thinking) but keeps text", () => {
    const p = new SSEParser();
    const out = p.push(
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"answer"}}\n',
    );
    expect(texts(out)).toEqual(["answer"]);
  });

  it("surfaces stop_reason from message_delta", () => {
    const p = new SSEParser();
    const out = p.push(
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n',
    );
    expect(out[0].stopReason).toBe("end_turn");
  });

  it("surfaces a streamed error event", () => {
    const p = new SSEParser();
    const out = p.push(
      'data: {"type":"error","error":{"type":"overloaded_error","message":"busy"}}\n',
    );
    expect(out[0].error).toEqual({ type: "overloaded_error", message: "busy" });
  });

  it("drops a malformed data line without throwing, keeps the rest", () => {
    const p = new SSEParser();
    const out = p.push(
      "data: {not json}\n" +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n',
    );
    expect(texts(out)).toEqual(["ok"]);
  });

  it("flush() emits a buffered final line with no trailing newline", () => {
    const p = new SSEParser();
    const pushed = p.push(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}}',
    );
    expect(texts(pushed)).toEqual([]); // no newline yet
    const flushed = p.flush();
    expect(texts(flushed)).toEqual(["a"]);
    expect(p.flush()).toEqual([]); // idempotent
  });
});
