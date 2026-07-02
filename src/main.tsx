import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./index.css";

// --- PWA service-worker registration ---
// `autoUpdate` strategy: a new version activates and reloads on the next
// navigation. Feature-checked + lazy-imported so dev, tests, and non-SW
// environments are unaffected.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      /* SW registration is best-effort; the app still runs without it. */
    });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
