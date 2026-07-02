import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AACBoard } from "./AACBoard";

// Mock the TTS hook so we can assert speak() is invoked without touching
// the real SpeechSynthesis API (absent in jsdom).
const speak = vi.fn();
vi.mock("@/hooks/useSpeak", () => ({
  useSpeak: () => ({ speak, cancel: vi.fn() }),
}));

describe("AACBoard", () => {
  beforeEach(() => speak.mockClear());

  it("renders nothing when closed", () => {
    const { container } = render(
      <AACBoard open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all eight core-word tiles when open", () => {
    render(<AACBoard open onClose={() => {}} />);
    for (const label of [
      "Yes",
      "No",
      "More",
      "Stop",
      "Help",
      "Break",
      "Again",
      "Done",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("speaks the word on tap", async () => {
    const user = userEvent.setup();
    render(<AACBoard open onClose={() => {}} volume={0.5} />);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(speak).toHaveBeenCalledWith("More", { volume: 0.5 });
  });

  it("fires onBreak for break and help, onAgain for again, onDone for done", async () => {
    const user = userEvent.setup();
    const onBreak = vi.fn();
    const onAgain = vi.fn();
    const onDone = vi.fn();
    render(
      <AACBoard
        open
        onClose={() => {}}
        onBreak={onBreak}
        onAgain={onAgain}
        onDone={onDone}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Break" }));
    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.click(screen.getByRole("button", { name: "Again" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onBreak).toHaveBeenCalledTimes(2);
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is a labelled modal dialog (accessibility)", () => {
    render(<AACBoard open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Communication board" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AACBoard open onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
