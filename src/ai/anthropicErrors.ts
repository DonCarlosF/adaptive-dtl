/**
 * Error types + friendly messages, split out of `anthropicClient.ts` so
 * UI surfaces (e.g. Settings toasts) can import them without pulling in
 * the fetch wrapper. The fetch wrapper is dynamically imported on demand.
 */

export type AnthropicError =
  | { kind: "no-key" }
  | { kind: "rate-limit"; message: string }
  | { kind: "auth"; message: string }
  | { kind: "network"; message: string }
  | { kind: "bad-response"; message: string }
  | { kind: "timeout" };

export function describeError(e: AnthropicError): string {
  switch (e.kind) {
    case "no-key":
      return "Add an Anthropic API key in Settings to generate activities.";
    case "rate-limit":
      return "Anthropic rate limited that request. Try again in a minute.";
    case "auth":
      return "API key was rejected. Double-check it in Settings.";
    case "network":
      return "Network error — generation failed. Using hand-authored activities.";
    case "bad-response":
      return "Anthropic returned an unexpected response. Using hand-authored activities.";
    case "timeout":
      return "Generation timed out. Using hand-authored activities.";
  }
}
