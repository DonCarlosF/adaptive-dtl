interface Props {
  /** When provided, shown beneath the spinner. */
  label?: string;
}

/**
 * Suspense fallback. Warm off-white background, slow sage ring, no jank.
 * Matches the design system so route transitions don't feel like a
 * loading state at all — they feel like the app pausing politely.
 */
export function LoadingScreen({ label }: Props) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner />
        {label && <div className="text-sm text-muted">{label}</div>}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      role="status"
      aria-label="Loading"
      style={{ animation: "spin 1200ms linear infinite" }}
    >
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        stroke="#E6E1D8"
        strokeWidth="3"
      />
      <path
        d="M 40 22 A 18 18 0 0 0 22 4"
        fill="none"
        stroke="#7BA098"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } svg[role='status'] { transform-origin: 22px 22px; }`}</style>
    </svg>
  );
}
