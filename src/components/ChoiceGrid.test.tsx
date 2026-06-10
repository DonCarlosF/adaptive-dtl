import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceGrid, ChoiceItem } from "./ChoiceGrid";

const items: ChoiceItem[] = [
  { id: "a", render: <span>A</span>, ariaLabel: "Choice A" },
  { id: "b", render: <span>B</span>, ariaLabel: "Choice B" },
];

describe("ChoiceGrid", () => {
  it("renders one button per choice with accessible labels", () => {
    render(
      <ChoiceGrid
        choices={items}
        correctId="a"
        selectedId={null}
        errorlessHighlight={false}
        locked={false}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByLabelText("Choice A")).toBeInTheDocument();
    expect(screen.getByLabelText("Choice B")).toBeInTheDocument();
  });

  it("calls onChoose with the tapped id", async () => {
    const onChoose = vi.fn();
    render(
      <ChoiceGrid
        choices={items}
        correctId="a"
        selectedId={null}
        errorlessHighlight={false}
        locked={false}
        onChoose={onChoose}
      />,
    );
    await userEvent.click(screen.getByLabelText("Choice B"));
    expect(onChoose).toHaveBeenCalledWith("b");
  });

  it("does not fire onChoose when locked", async () => {
    const onChoose = vi.fn();
    render(
      <ChoiceGrid
        choices={items}
        correctId="a"
        selectedId={null}
        errorlessHighlight={false}
        locked
        onChoose={onChoose}
      />,
    );
    await userEvent.click(screen.getByLabelText("Choice A"));
    expect(onChoose).not.toHaveBeenCalled();
  });
});
