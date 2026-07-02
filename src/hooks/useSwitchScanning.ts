import { useEffect, useRef, useState } from "react";

interface Options {
  /** Switch scanning is turned on in settings. */
  enabled: boolean;
  /** Number of items being scanned. */
  count: number;
  /** Dwell time on each item before advancing, in ms. */
  intervalMs: number;
  /** Whether scanning should currently run (e.g. only during an unlocked trial). */
  active: boolean;
  /** Called with the highlighted index when the switch is activated. */
  onSelect: (index: number) => void;
}

/**
 * Single-switch scanning input.
 *
 * Many students who can't reliably touch a target can operate one switch
 * (a button, a key, a head/AAC switch mapped to a keypress). Scanning
 * highlights the choice tiles one at a time on a fixed dwell; a single
 * activation selects whichever is highlighted.
 *
 * Activation sources: Space or Enter (most switch interfaces emit one of
 * these), or the returned `select()` for an on-screen switch button.
 *
 * Returns the highlighted index (or -1 when not scanning) and a `select`
 * callback that picks the current item.
 */
export function useSwitchScanning({
  enabled,
  count,
  intervalMs,
  active,
  onSelect,
}: Options): { index: number; select: () => void } {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const running = enabled && active && count > 0;

  // Advance the highlight on a fixed dwell. Reset to the first item each
  // time scanning (re)starts so every trial begins predictably.
  useEffect(() => {
    if (!running) return;
    setIndex(0);
    indexRef.current = 0;
    const id = window.setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % count;
        indexRef.current = next;
        return next;
      });
    }, Math.max(300, intervalMs));
    return () => window.clearInterval(id);
  }, [running, count, intervalMs]);

  const select = () => {
    if (!running) return;
    onSelectRef.current(indexRef.current);
  };

  // Switch activation via keyboard (Space / Enter).
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onSelectRef.current(indexRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  return { index: running ? index : -1, select };
}
