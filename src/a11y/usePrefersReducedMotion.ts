import { useEffect, useState } from "react";

/**
 * Accessibility utility — `prefers-reduced-motion`.
 *
 * Reads the OS-level "reduce motion" preference and keeps it in sync if the
 * user changes it mid-session. Components gate non-essential animation
 * (breathe, fade, pulse) on this so vestibular-sensitive learners are not
 * subjected to motion they did not ask for (WCAG 2.3.3 Animation from
 * Interactions, AAA).
 *
 * SSR/test-safe: returns `false` (motion allowed) when `matchMedia` is
 * unavailable so it never throws in non-browser environments.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // Safari <14 only supports the deprecated addListener signature.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}
