import { describe, it, expect } from "vitest";
import {
  buildCopilotUserPrompt,
  buildIepUserPrompt,
  iepProgressNoteSchema,
  parseIepNote,
} from "./copilotPrompts";
import type { CopilotContext } from "./copilotContext";

const ctx: CopilotContext = {
  studentName: "Robin",
  grade: "4th",
  readingLevel: "1st",
  responseMethod: "touch",
  lowStim: true,
  profileNote: "Loves animals.",
  totalSessions: 4,
  daysSinceLastSession: 2,
  domains: [
    {
      domain: "sightWords",
      label: "Sight Words",
      sessionCount: 4,
      latestAccuracy: 0.85,
      meanAccuracy: 0.6,
      trend: "improving",
      totalTrials: 32,
      adaptations: { "enable-errorless": 2 },
    },
  ],
};

const validNote = {
  presentLevels:
    "Robin reliably identifies high-frequency sight words at the 1st-grade level.",
  progressTowardGoal:
    "Accuracy rose from 40% to 85% across four sessions — an improving trend.",
  recommendation:
    "Target 90% accuracy across three consecutive sessions before adding new words.",
  dataConfidence: "moderate" as const,
  caveat: "AI-assisted draft; verify against the IEP goal and team judgment.",
};

describe("iepProgressNoteSchema", () => {
  it("accepts a well-formed note", () => {
    expect(iepProgressNoteSchema.safeParse(validNote).success).toBe(true);
  });

  it("rejects a missing section", () => {
    const { presentLevels: _drop, ...rest } = validNote;
    void _drop;
    expect(iepProgressNoteSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid dataConfidence enum value", () => {
    expect(
      iepProgressNoteSchema.safeParse({ ...validNote, dataConfidence: "certain" }).success,
    ).toBe(false);
  });

  it("rejects a too-short section", () => {
    expect(
      iepProgressNoteSchema.safeParse({ ...validNote, recommendation: "more" }).success,
    ).toBe(false);
  });
});

describe("parseIepNote", () => {
  it("parses a clean JSON response", () => {
    const out = parseIepNote(JSON.stringify(validNote));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.note.dataConfidence).toBe("moderate");
  });

  it("tolerates prose wrapped around the JSON object", () => {
    const out = parseIepNote(
      "Here is the draft:\n\n" + JSON.stringify(validNote) + "\n\nLet me know!",
    );
    expect(out.ok).toBe(true);
  });

  it("fails cleanly with no JSON object", () => {
    const out = parseIepNote("I cannot help with that.");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/no json/i);
  });

  it("fails cleanly on a schema-invalid object", () => {
    const out = parseIepNote(JSON.stringify({ ...validNote, dataConfidence: "nope" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("dataConfidence");
  });

  it("fails cleanly on malformed JSON", () => {
    const out = parseIepNote("{ presentLevels: oops }");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/invalid json/i);
  });
});

describe("prompt builders", () => {
  it("embeds the rendered brief and the question in the chat prompt", () => {
    const p = buildCopilotUserPrompt(ctx, "  What next?  ");
    expect(p).toContain("Robin");
    expect(p).toContain("Sight Words");
    expect(p).toContain("What next?");
    expect(p).not.toContain("  What next?  "); // trimmed
  });

  it("builds an IEP prompt that asks for the JSON object", () => {
    const p = buildIepUserPrompt(ctx);
    expect(p).toContain("Robin");
    expect(p.toLowerCase()).toContain("json object");
  });
});
