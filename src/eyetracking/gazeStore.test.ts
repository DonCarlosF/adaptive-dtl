import { describe, it, expect, afterEach } from "vitest";
import { useGazeStore } from "./gazeStore";

afterEach(() => {
  // Always stop any running source so timers don't leak between tests.
  useGazeStore.getState().disable();
});

describe("gazeStore.enable", () => {
  it("starts the simulated source when camera is not requested", async () => {
    const mode = await useGazeStore.getState().enable(false);
    expect(mode).toBe("simulated");
    expect(useGazeStore.getState().enabled).toBe(true);
    expect(useGazeStore.getState().trackingError).toBeNull();
  });

  it("falls back to simulated when the camera is unavailable", async () => {
    // jsdom has no navigator.mediaDevices, so real tracking can't start.
    const mode = await useGazeStore.getState().enable(true);
    expect(mode).toBe("simulated");
    expect(useGazeStore.getState().trackingError).toMatch(/simulated/i);
  });

  it("is idempotent while already running", async () => {
    await useGazeStore.getState().enable(false);
    const second = await useGazeStore.getState().enable(false);
    expect(second).toBe("simulated");
  });
});

describe("gazeStore.disable", () => {
  it("returns the store to the off state", async () => {
    await useGazeStore.getState().enable(false);
    useGazeStore.getState().disable();
    expect(useGazeStore.getState().mode).toBe("off");
    expect(useGazeStore.getState().enabled).toBe(false);
    expect(useGazeStore.getState().latest).toBeNull();
  });
});

describe("gazeStore.pushSample", () => {
  it("records on-screen samples and updates lastOnScreenAt", () => {
    useGazeStore.getState().resetBuffer();
    useGazeStore
      .getState()
      .pushSample({ x: 100, y: 100, timestamp: 1000, confidence: 0.7 });
    const s = useGazeStore.getState();
    expect(s.latest?.x).toBe(100);
    expect(s.lastOnScreenAt).toBe(1000);
    expect(s.buffer).toHaveLength(1);
  });

  it("keeps the previous lastOnScreenAt for an off-screen sample", () => {
    useGazeStore.getState().resetBuffer();
    useGazeStore
      .getState()
      .pushSample({ x: 100, y: 100, timestamp: 1000, confidence: 0.7 });
    useGazeStore
      .getState()
      .pushSample({ x: -50, y: 100, timestamp: 1100, confidence: 0.2 });
    const s = useGazeStore.getState();
    expect(s.latest?.x).toBe(-50);
    expect(s.lastOnScreenAt).toBe(1000); // unchanged by the off-screen sample
  });
});
