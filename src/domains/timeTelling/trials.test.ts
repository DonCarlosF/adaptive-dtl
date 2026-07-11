import { describe, it, expect } from "vitest";
import { buildTimeTrials, findTime, TIME_ITEMS } from "./trials";

describe("TIME_ITEMS", () => {
  it("is the curated 16-item set: twelve o'clock times + four half-past", () => {
    expect(TIME_ITEMS).toHaveLength(16);
    expect(TIME_ITEMS.filter((t) => t.minutes === 0)).toHaveLength(12);
    expect(TIME_ITEMS.filter((t) => t.minutes === 30)).toHaveLength(4);
  });

  it("has unique ids and valid clock values", () => {
    const ids = TIME_ITEMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(TIME_ITEMS.length);
    for (const t of TIME_ITEMS) {
      expect(t.hour).toBeGreaterThanOrEqual(1);
      expect(t.hour).toBeLessThanOrEqual(12);
      expect([0, 30]).toContain(t.minutes);
    }
  });

  it("labels o'clock and half-past times the way they are spoken", () => {
    expect(findTime("t-3-00")?.label).toBe("3 o'clock");
    expect(findTime("t-6-30")?.label).toBe("half past 6");
  });

  it("findTime returns undefined for unknown ids", () => {
    expect(findTime("t-13-00")).toBeUndefined();
    expect(findTime("nope")).toBeUndefined();
  });
});

describe("buildTimeTrials", () => {
  const trials = buildTimeTrials();

  it("builds one trial per item", () => {
    expect(trials).toHaveLength(TIME_ITEMS.length);
  });

  it("uses unique tt- prefixed template ids", () => {
    const ids = trials.map((t) => t.id);
    expect(new Set(ids).size).toBe(trials.length);
    for (const id of ids) expect(id).toMatch(/^tt-t-\d+-(00|30)-\d+$/);
  });

  it("always includes the correct choice among the choices", () => {
    for (const t of trials) {
      expect(t.choiceIds).toContain(t.correctChoiceId);
      expect(findTime(t.correctChoiceId)).toBeDefined();
    }
  });

  it("prompts name the time on the clock", () => {
    for (const t of trials) {
      const item = findTime(t.correctChoiceId)!;
      expect(t.prompt).toBe(`Touch the clock that shows ${item.label}.`);
    }
  });

  it("marks half-past reads as harder than o'clock reads", () => {
    for (const t of trials) {
      const item = findTime(t.correctChoiceId)!;
      expect(t.difficulty).toBe(item.minutes === 30 ? 2 : 1);
    }
  });
});
