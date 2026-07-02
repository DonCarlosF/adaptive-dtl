import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { matchSpoken, normalize } from "./matchSpoken";
import { useSpeechRecognition } from "./useSpeechRecognition";
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
} from "./speechRecognitionTypes";

// --- matchSpoken: pure matching logic -------------------------------------

describe("matchSpoken", () => {
  const choices = [
    { id: "c-dollar", label: "dollar" },
    { id: "c-quarter", label: "quarter" },
    { id: "c-stop", label: "stop sign" },
  ];

  it("normalizes case and punctuation", () => {
    expect(normalize("  The DOLLAR! ")).toBe("the dollar");
  });

  it("matches an exact spoken label (case-insensitive)", () => {
    const m = matchSpoken("Dollar", choices);
    expect(m?.id).toBe("c-dollar");
    expect(m?.score).toBe(1);
  });

  it("matches when the label is contained in a phrase", () => {
    const m = matchSpoken("I think it's the dollar", choices);
    expect(m?.id).toBe("c-dollar");
  });

  it("matches on a standalone label word (multi-word label)", () => {
    const m = matchSpoken("stop", choices);
    expect(m?.id).toBe("c-stop");
  });

  it("fuzzy-matches a recognizer slip", () => {
    const m = matchSpoken("doller", choices);
    expect(m?.id).toBe("c-dollar");
    expect(m!.score).toBeGreaterThan(0.7);
    expect(m!.score).toBeLessThan(1);
  });

  it("returns null for no confident match", () => {
    expect(matchSpoken("banana", choices)).toBeNull();
    expect(matchSpoken("", choices)).toBeNull();
  });

  it("refuses to guess between two equally-good matches", () => {
    const tie = [
      { id: "a", label: "cat" },
      { id: "b", label: "cat" },
    ];
    expect(matchSpoken("cat", tie)).toBeNull();
  });
});

// --- useSpeechRecognition: hook behavior ----------------------------------

class MockRecognition implements Partial<SpeechRecognitionLike> {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((e: SpeechRecognitionEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => false);

  /** Helper: simulate a recognition result event. */
  emit(transcript: string, isFinal = true) {
    const event = {
      resultIndex: 0,
      results: {
        length: 1,
        item: () => ({}) as never,
        0: {
          isFinal,
          length: 1,
          item: () => ({ transcript, confidence: 0.9 }),
          0: { transcript, confidence: 0.9 },
        },
      },
    } as unknown as SpeechRecognitionEvent;
    this.onresult?.(event);
  }
}

describe("useSpeechRecognition", () => {
  let instance: MockRecognition;

  beforeEach(() => {
    instance = new MockRecognition();
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      function () {
        return instance;
      };
  });

  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
  });

  it("reports supported and fires onMatch on a confident result", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({
        choices: [{ id: "yes", label: "yes" }],
        onMatch,
      }),
    );

    expect(result.current.supported).toBe(true);

    act(() => result.current.start());
    expect(instance.start).toHaveBeenCalled();
    expect(result.current.listening).toBe(true);

    act(() => instance.emit("yes"));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch.mock.calls[0][0].id).toBe("yes");
  });

  it("only fires onMatch once per utterance", () => {
    const onMatch = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ choices: [{ id: "yes", label: "yes" }], onMatch }),
    );
    act(() => result.current.start());
    act(() => instance.emit("yes please"));
    act(() => instance.emit("yes please yes"));
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it("is a graceful no-op when the API is unavailable", () => {
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
    const onMatch = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ choices: [], onMatch }),
    );
    expect(result.current.supported).toBe(false);
    act(() => result.current.start()); // must not throw
    expect(onMatch).not.toHaveBeenCalled();
  });
});
