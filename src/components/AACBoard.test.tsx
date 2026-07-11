import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AACBoard } from "./AACBoard";
import { setLanguage } from "@/i18n/strings";

// Mock the TTS hook so we can assert speak() is invoked without touching
// the real SpeechSynthesis API (absent in jsdom).
const speak = vi.fn();
vi.mock("@/hooks/useSpeak", () => ({
  useSpeak: () => ({ speak, cancel: vi.fn() }),
}));

describe("AACBoard", () => {
  beforeEach(() => speak.mockClear());
  afterEach(() => setLanguage("en"));

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
    expect(speak).toHaveBeenCalledWith("More", { volume: 0.5, lang: "en-US" });
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

  // --- per-student fringe vocabulary (extraWords) ---

  it("renders extra words as tiles inside a labelled 'My words' group", () => {
    render(
      <AACBoard open onClose={() => {}} extraWords={["pizza", "Mom", "dinosaur"]} />,
    );
    const group = screen.getByRole("group", { name: "My words" });
    expect(group).toBeInTheDocument();
    expect(group).toHaveTextContent("My words");
    for (const word of ["pizza", "Mom", "dinosaur"]) {
      expect(screen.getByRole("button", { name: word })).toBeInTheDocument();
    }
    // Core tiles are still all present alongside the extra group.
    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
  });

  it("speaks an extra word on tap with the same TTS pathway", async () => {
    const user = userEvent.setup();
    render(
      <AACBoard open onClose={() => {}} volume={0.3} extraWords={["pizza"]} />,
    );
    await user.click(screen.getByRole("button", { name: "pizza" }));
    expect(speak).toHaveBeenCalledWith("pizza", { volume: 0.3, lang: "en-US" });
  });

  it("shows no 'My words' group when extraWords is absent or empty", () => {
    const { rerender } = render(<AACBoard open onClose={() => {}} />);
    expect(screen.queryByRole("group", { name: "My words" })).toBeNull();
    rerender(<AACBoard open onClose={() => {}} extraWords={[]} />);
    expect(screen.queryByRole("group", { name: "My words" })).toBeNull();
    // Whitespace-only entries are ignored too.
    rerender(<AACBoard open onClose={() => {}} extraWords={["  ", ""]} />);
    expect(screen.queryByRole("group", { name: "My words" })).toBeNull();
  });

  // --- student-facing localization ---

  it("renders and speaks core words in Spanish when the language is 'es'", async () => {
    setLanguage("es");
    const user = userEvent.setup();
    render(<AACBoard open onClose={() => {}} volume={1} extraWords={["pizza"]} />);
    expect(
      screen.getByRole("dialog", { name: "Tablero de comunicación" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mis palabras" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sí" }));
    expect(speak).toHaveBeenCalledWith("Sí", { volume: 1, lang: "es-ES" });
    // Personal words render verbatim but speak with the student's language voice.
    await user.click(screen.getByRole("button", { name: "pizza" }));
    expect(speak).toHaveBeenCalledWith("pizza", { volume: 1, lang: "es-ES" });
  });
});
