import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSwitchScanning } from "./useSwitchScanning";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSwitchScanning", () => {
  it("returns -1 when not active", () => {
    const { result } = renderHook(() =>
      useSwitchScanning({
        enabled: true,
        count: 3,
        intervalMs: 1000,
        active: false,
        onSelect: () => {},
      }),
    );
    expect(result.current.index).toBe(-1);
  });

  it("advances the highlight on the dwell interval", () => {
    const { result } = renderHook(() =>
      useSwitchScanning({
        enabled: true,
        count: 3,
        intervalMs: 1000,
        active: true,
        onSelect: () => {},
      }),
    );
    expect(result.current.index).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.index).toBe(1);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // 0 -> 1 -> 2 -> wraps to 0
    expect(result.current.index).toBe(0);
  });

  it("select() fires onSelect with the highlighted index", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useSwitchScanning({
        enabled: true,
        count: 3,
        intervalMs: 1000,
        active: true,
        onSelect,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(1000); // index -> 1
    });
    act(() => {
      result.current.select();
    });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("selects on Space keydown", () => {
    const onSelect = vi.fn();
    renderHook(() =>
      useSwitchScanning({
        enabled: true,
        count: 2,
        intervalMs: 1000,
        active: true,
        onSelect,
      }),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("does nothing when disabled", () => {
    const onSelect = vi.fn();
    renderHook(() =>
      useSwitchScanning({
        enabled: false,
        count: 2,
        intervalMs: 1000,
        active: true,
        onSelect,
      }),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('explicit mode: "auto" behaves like the default (timer + Enter selects)', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useSwitchScanning({
        enabled: true,
        count: 3,
        intervalMs: 1000,
        active: true,
        onSelect,
        mode: "auto",
      }),
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.index).toBe(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe("useSwitchScanning — step mode (manual two-switch)", () => {
  const opts = (onSelect: (i: number) => void = () => {}) => ({
    enabled: true,
    count: 3,
    intervalMs: 1000,
    active: true,
    onSelect,
    mode: "step" as const,
  });

  it("never advances on a timer", () => {
    const { result } = renderHook(() => useSwitchScanning(opts()));
    expect(result.current.index).toBe(0);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.index).toBe(0);
  });

  it("Space (switch 1) advances the highlight and wraps around", () => {
    const { result } = renderHook(() => useSwitchScanning(opts()));
    const press = () =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
      });
    press();
    expect(result.current.index).toBe(1);
    press();
    expect(result.current.index).toBe(2);
    press(); // wraps 2 -> 0
    expect(result.current.index).toBe(0);
  });

  it("Space does NOT select in step mode", () => {
    const onSelect = vi.fn();
    renderHook(() => useSwitchScanning(opts(onSelect)));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Enter (switch 2) selects the currently highlighted item", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSwitchScanning(opts(onSelect)));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })); // -> 1
    });
    expect(result.current.index).toBe(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("on-screen next() advances and select() chooses (button pathway)", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSwitchScanning(opts(onSelect)));
    act(() => {
      result.current.next();
    });
    act(() => {
      result.current.next();
    });
    expect(result.current.index).toBe(2);
    act(() => {
      result.current.select();
    });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("next()/keys are inert when not running, and index resets on restart", () => {
    const onSelect = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useSwitchScanning({ ...opts(onSelect), active }),
      { initialProps: { active: true } },
    );
    act(() => {
      result.current.next(); // -> 1
    });
    expect(result.current.index).toBe(1);

    rerender({ active: false });
    expect(result.current.index).toBe(-1);
    act(() => {
      result.current.next();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(onSelect).not.toHaveBeenCalled();

    // Restarting scanning begins back at the first item.
    rerender({ active: true });
    expect(result.current.index).toBe(0);
  });
});
