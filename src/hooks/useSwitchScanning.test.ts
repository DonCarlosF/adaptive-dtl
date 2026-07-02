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
});
