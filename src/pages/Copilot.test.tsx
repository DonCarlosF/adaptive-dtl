import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copilot } from "./Copilot";
import type { StudentProfile } from "@/engine/types";

// --- Mocks ----------------------------------------------------------------
// The drawer reads sessions + settings on mount and dynamically imports the
// streaming client. Mock all three so the component renders deterministically
// without IndexedDB or the network.

vi.mock("@/db/sessionRepo", () => ({
  sessionRepo: { listForStudent: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/db/settingsRepo", () => ({
  settingsRepo: { get: vi.fn().mockResolvedValue({ apiKey: "sk-test" }) },
}));

const streamAnthropic = vi.fn();
vi.mock("@/ai/anthropicStream", () => ({
  streamAnthropic: (...args: unknown[]) => streamAnthropic(...args),
}));

const student: StudentProfile = {
  id: "s1",
  name: "Robin",
  avatar: "🦊",
  grade: "4th",
  readingLevel: "1st",
  goals: ["sightWords"],
  responseMethod: "touch",
  lowStim: false,
  attentionBaselineMin: 5,
  createdAt: 0,
};

beforeEach(() => {
  streamAnthropic.mockReset();
});

describe("Copilot drawer", () => {
  it("streams a co-pilot answer token-by-token into the transcript", async () => {
    // Simulate the streaming client: emit tokens, then resolve with the final.
    streamAnthropic.mockImplementation(
      async (params: { onToken?: (s: string) => void }) => {
        params.onToken?.("Focus ");
        params.onToken?.("on stop signs.");
        return { ok: true, result: { text: "Focus on stop signs.", model: "m" } };
      },
    );

    const user = userEvent.setup();
    render(<Copilot student={student} onClose={() => {}} />);

    // Wait for the context to load (input becomes enabled).
    const input = await screen.findByPlaceholderText("Ask the co-pilot…");
    await user.type(input, "What next?");
    await user.keyboard("{Enter}");

    // The teacher's question and the streamed answer both appear.
    expect(await screen.findByText("What next?")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Focus on stop signs.")).toBeInTheDocument(),
    );
    expect(streamAnthropic).toHaveBeenCalledOnce();
  });

  it("renders a validated IEP draft from the draft action", async () => {
    streamAnthropic.mockResolvedValue({
      ok: true,
      result: {
        model: "m",
        text: JSON.stringify({
          presentLevels:
            "Robin identifies common sight words at the first-grade level.",
          progressTowardGoal:
            "Accuracy is trending upward across recent sessions in this area.",
          recommendation:
            "Target 90% accuracy across three consecutive sessions next.",
          dataConfidence: "low",
          caveat: "AI-assisted draft; verify with the IEP team.",
        }),
      },
    });

    const user = userEvent.setup();
    render(<Copilot student={student} onClose={() => {}} />);

    const draftBtn = await screen.findByRole("button", {
      name: /draft iep progress note/i,
    });
    await user.click(draftBtn);

    expect(await screen.findByText(/present levels/i)).toBeInTheDocument();
    expect(
      screen.getByText(/identifies common sight words/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/data confidence: low/i)).toBeInTheDocument();
  });

  it("shows a clean error when an IEP draft fails validation", async () => {
    streamAnthropic.mockResolvedValue({
      ok: true,
      result: { model: "m", text: "I cannot produce that." },
    });

    const user = userEvent.setup();
    render(<Copilot student={student} onClose={() => {}} />);

    const draftBtn = await screen.findByRole("button", {
      name: /draft iep progress note/i,
    });
    await user.click(draftBtn);

    expect(await screen.findByText(/draft rejected/i)).toBeInTheDocument();
  });
});
