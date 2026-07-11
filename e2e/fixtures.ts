import { test as base, expect } from "@playwright/test";

/**
 * Browser-side stubs injected into every page before any app code runs.
 *
 * Why: `StudentSession` locks trial input until the TTS prompt finishes —
 * `useSpeak` waits for `SpeechSynthesisUtterance.onend` before setting
 * `startedAt`, and headless Chromium never actually speaks (so `end` never
 * fires). Replacing `window.speechSynthesis` with a stub whose `speak()`
 * asynchronously invokes `utterance.onend` (~50ms) unlocks trials
 * deterministically. `cancel`/`getVoices`/listeners are inert no-ops.
 *
 * AudioContext (used by `useChime`) works fine headless and needs no stub.
 */
function stubSpeechSynthesis() {
  const noop = () => undefined;
  const stub = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    speak(utterance: SpeechSynthesisUtterance) {
      window.setTimeout(() => {
        try {
          utterance.onend?.call(
            utterance,
            new Event("end") as unknown as SpeechSynthesisEvent,
          );
        } catch {
          /* the app treats end/error alike — never let the stub throw */
        }
      }, 50);
    },
    cancel: noop,
    pause: noop,
    resume: noop,
    getVoices: () => [] as SpeechSynthesisVoice[],
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, "speechSynthesis", {
    value: stub,
    configurable: true,
  });
  // Headless Chromium ships the constructor, but guard anyway so `new
  // SpeechSynthesisUtterance(text)` can never explode in a stripped build.
  if (!("SpeechSynthesisUtterance" in window)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: unknown = null;
      onend: unknown = null;
      onerror: unknown = null;
      onstart: unknown = null;
      constructor(text = "") {
        this.text = text;
      }
    };
  }
}

/**
 * Project-wide test fixture: every context gets the speech stub, so any
 * page a spec opens (including after reloads) has deterministic TTS.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(stubSpeechSynthesis);
    await use(context);
  },
});

export { expect };
