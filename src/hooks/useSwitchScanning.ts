import { useEffect, useRef, useState } from "react";

/**
 * How the scan highlight moves and how a choice is made.
 *
 * - "auto": the highlight advances by itself on a fixed dwell; ONE switch
 *   (Space/Enter or the on-screen Select button) chooses the highlighted
 *   item. This is classic single-switch automatic scanning.
 * - "step": no timer. Manual two-switch scanning — switch 1 (Space, or the
 *   on-screen Next button) advances the highlight; switch 2 (Enter, or the
 *   on-screen Select button) chooses it. Suits students who find timed
 *   scanning stressful or who can operate two switches at their own pace.
 */
export type ScanMode = "auto" | "step";

interface Options {
  /** Switch scanning is turned on in settings. */
  enabled: boolean;
  /** Number of items being scanned. */
  count: number;
  /** Dwell time on each item before advancing, in ms (auto mode only). */
  intervalMs: number;
  /** Whether scanning should currently run (e.g. only during an unlocked trial). */
  active: boolean;
  /** Called with the highlighted index when the switch is activated. */
  onSelect: (index: number) => void;
  /** Scanning mode; defaults to "auto" (timed dwell, unchanged behavior). */
  mode?: ScanMode;
}

/**
 * Switch scanning input.
 *
 * Many students who can't reliably touch a target can operate one or two
 * switches (buttons, keys, head/AAC switches mapped to keypresses).
 * Scanning highlights the choice tiles one at a time; an activation selects
 * whichever is highlighted. See {@link ScanMode} for the two movement modes.
 *
 * Activation sources: keyboard (most switch interfaces emit Space or
 * Enter), or the returned callbacks for on-screen switch buttons —
 * `select()` picks the current item; `next()` advances the highlight
 * (meaningful in "step" mode, harmless in "auto").
 *
 * Returns the highlighted index (or -1 when not scanning) plus the
 * `select` / `next` callbacks.
 */
export function useSwitchScanning({
  enabled,
  count,
  intervalMs,
  active,
  onSelect,
  mode = "auto",
}: Options): { index: number; select: () => void; next: () => void } {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const running = enabled && active && count > 0;

  // Manual advance — switch 1 in step mode (also exposed in auto mode,
  // where it simply hops the dwell forward).
  const next = () => {
    if (!running) return;
    setIndex((i) => {
      const n = (i + 1) % count;
      indexRef.current = n;
      return n;
    });
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  // Reset to the first item each time scanning (re)starts so every trial
  // begins predictably. In "auto" mode, advance the highlight on a fixed
  // dwell; in "step" mode there is no timer — the student sets the pace.
  useEffect(() => {
    if (!running) return;
    setIndex(0);
    indexRef.current = 0;
    if (mode !== "auto") return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % count;
        indexRef.current = next;
        return next;
      });
    }, Math.max(300, intervalMs));
    return () => window.clearInterval(id);
  }, [running, count, intervalMs, mode]);

  const select = () => {
    if (!running) return;
    onSelectRef.current(indexRef.current);
  };

  // Switch activation via keyboard.
  //   auto: Space or Enter both select (single-switch).
  //   step: Space advances (switch 1), Enter selects (switch 2).
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (mode === "step") {
        if (e.key === " ") {
          e.preventDefault();
          nextRef.current();
        } else if (e.key === "Enter") {
          e.preventDefault();
          onSelectRef.current(indexRef.current);
        }
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onSelectRef.current(indexRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, mode]);

  return { index: running ? index : -1, select, next };
}
