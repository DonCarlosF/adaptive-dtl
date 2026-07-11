import { TrialTemplate } from "@/engine/types";

/**
 * Time Telling — analog clock reading, the first two steps of the
 * functional sequence: on-the-hour ("3 o'clock") and half-past
 * ("half past 6"). Digital time, quarter hours, and five-minute
 * increments are deliberately out of scope for first-line drill.
 *
 * Curated set: all twelve o'clock times (the IEP-standard first target)
 * plus four half-past times spread around the face, so early half-past
 * work sees the minute hand pointing down against clearly different
 * hour-hand positions. 16 items total.
 */

export interface TimeItem {
  id: string;
  /** Hour on the clock face, 1–12. */
  hour: number;
  /** Minutes — this domain only renders 0 (o'clock) and 30 (half past). */
  minutes: 0 | 30;
  /** Display + spoken label, e.g. "3 o'clock", "half past 6". */
  label: string;
}

function oclock(hour: number): TimeItem {
  return { id: `t-${hour}-00`, hour, minutes: 0, label: `${hour} o'clock` };
}

function halfPast(hour: number): TimeItem {
  return { id: `t-${hour}-30`, hour, minutes: 30, label: `half past ${hour}` };
}

export const TIME_ITEMS: TimeItem[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(oclock),
  halfPast(1),
  halfPast(3),
  halfPast(6),
  halfPast(9),
];

export function findTime(id: string): TimeItem | undefined {
  return TIME_ITEMS.find((t) => t.id === id);
}

export function buildTimeTrials(): TrialTemplate[] {
  const choiceIds = TIME_ITEMS.map((t) => t.id);
  // One pass through the full set — 16 templates. The engine picks the
  // trial count and distractors per session at presentation time.
  return TIME_ITEMS.map((item, i) => ({
    id: `tt-${item.id}-${i}`,
    prompt: `Touch the clock that shows ${item.label}.`,
    correctChoiceId: item.id,
    choiceIds,
    // Half-past reads are the harder skill.
    difficulty: item.minutes === 30 ? (2 as const) : (1 as const),
  }));
}
