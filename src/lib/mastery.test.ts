import { describe, it, expect } from "vitest";
import { DomainId, SessionRecord, TrialResult } from "@/engine/types";
import {
  computeItemMastery,
  inferItemIdFromTemplateId,
  masteryBucket,
} from "@/lib/mastery";

function trial(p: Partial<TrialResult>): TrialResult {
  return {
    index: 0,
    templateId: "sw-w-the",
    domain: "sightWords",
    numChoices: 3,
    correct: true,
    responseTimeMs: 1500,
    errorlessHighlight: false,
    timestamp: 1_000,
    ...p,
  };
}

function session(
  trials: TrialResult[],
  domain: DomainId = "sightWords",
): SessionRecord {
  return {
    id: `sess-${Math.random()}`,
    studentId: "stu-1",
    domain,
    startedAt: 0,
    endedAt: 1,
    trials,
    adaptations: [],
    endedEarly: false,
    accuracy: 0.5,
  };
}

describe("inferItemIdFromTemplateId", () => {
  it("handles all five domain prefixes", () => {
    expect(inferItemIdFromTemplateId("sw-w-the")).toBe("w-the");
    expect(inferItemIdFromTemplateId("mn-m-quarter-7")).toBe("m-quarter");
    expect(inferItemIdFromTemplateId("sg-s-stop-3")).toBe("s-stop");
    expect(inferItemIdFromTemplateId("tt-t-3-00-2")).toBe("t-3-00");
    expect(inferItemIdFromTemplateId("em-e-happy-9")).toBe("e-happy");
  });

  it("strips the trailing trial index but keeps digits inside the item id", () => {
    expect(inferItemIdFromTemplateId("mn-m-bill-5-8")).toBe("m-bill-5");
    expect(inferItemIdFromTemplateId("tt-t-12-30-15")).toBe("t-12-30");
    expect(inferItemIdFromTemplateId("sg-s-dont-walk-10")).toBe("s-dont-walk");
  });

  it("returns null for seeded, AI-generated, and unknown shapes", () => {
    expect(inferItemIdFromTemplateId("sightWords-0")).toBeNull(); // seed data
    expect(inferItemIdFromTemplateId("ai-sightWords-0-abc123")).toBeNull();
    expect(inferItemIdFromTemplateId("xx-foo-1")).toBeNull();
    expect(inferItemIdFromTemplateId("")).toBeNull();
  });
});

describe("masteryBucket", () => {
  it("calls anything with fewer than 3 attempts new, regardless of accuracy", () => {
    expect(masteryBucket(0, 0)).toBe("new");
    expect(masteryBucket(2, 1)).toBe("new");
  });

  it("requires both 90% accuracy and 5 attempts for mastered", () => {
    expect(masteryBucket(5, 0.9)).toBe("mastered");
    expect(masteryBucket(10, 1)).toBe("mastered");
    expect(masteryBucket(4, 1)).toBe("developing"); // accurate but too few
    expect(masteryBucket(5, 0.89)).toBe("developing"); // enough but not accurate
  });

  it("splits developing vs emerging at 60%", () => {
    expect(masteryBucket(10, 0.6)).toBe("developing");
    expect(masteryBucket(10, 0.59)).toBe("emerging");
    expect(masteryBucket(3, 0)).toBe("emerging");
  });
});

describe("computeItemMastery", () => {
  it("returns an empty record for no sessions", () => {
    expect(computeItemMastery([])).toEqual({});
  });

  it("skips trials whose templateId can't be attributed to an item", () => {
    const s = session([
      trial({ templateId: "sightWords-0" }),
      trial({ templateId: "ai-moneyId-1-zz" }),
    ]);
    expect(computeItemMastery([s])).toEqual({});
  });

  it("aggregates attempts, correct, accuracy and lastSeen across sessions", () => {
    const s1 = session([
      trial({ templateId: "sw-w-the", correct: true, timestamp: 100 }),
      trial({ templateId: "sw-w-the", correct: false, timestamp: 200 }),
    ]);
    const s2 = session([
      trial({ templateId: "sw-w-the", correct: true, timestamp: 900 }),
      trial({ templateId: "sw-w-the", correct: true, timestamp: 300 }),
    ]);
    const out = computeItemMastery([s1, s2]);
    expect(out["w-the"]).toEqual({
      itemId: "w-the",
      attempts: 4,
      correct: 3,
      accuracy: 0.75,
      lastSeen: 900,
      bucket: "developing",
    });
  });

  it("keeps items from different domains separate", () => {
    const s = session([
      trial({ templateId: "mn-m-penny-0", domain: "moneyId", correct: true }),
      trial({ templateId: "em-e-happy-3", domain: "emotions", correct: false }),
      trial({ templateId: "tt-t-3-00-1", domain: "timeTelling", correct: true }),
    ]);
    const out = computeItemMastery([s]);
    expect(Object.keys(out).sort()).toEqual(["e-happy", "m-penny", "t-3-00"]);
    expect(out["m-penny"].bucket).toBe("new"); // 1 attempt
  });

  it("buckets a fully-drilled item as mastered", () => {
    const trials = Array.from({ length: 6 }, (_, i) =>
      trial({ templateId: `em-e-calm-${i}`, correct: true, timestamp: i }),
    );
    const out = computeItemMastery([session(trials, "emotions")]);
    expect(out["e-calm"].bucket).toBe("mastered");
    expect(out["e-calm"].attempts).toBe(6);
    expect(out["e-calm"].accuracy).toBe(1);
  });
});
