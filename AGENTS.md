# Agent instructions — Adaptive DTL

This file is the **canonical** project instructions for coding agents. Cursor loads it from the repo root and combines any nested `AGENTS.md` (more specific wins). [CLAUDE.md](./CLAUDE.md) is a thin Claude Code bridge (`@AGENTS.md`) — do not duplicate rules there. Do not add a legacy `.cursorrules` file. Product rationale lives in [README.md](./README.md); do not rewrite classroom pedagogy there unless the engine actually changed.

**Adaptive DTL** is a local-first special-education app for discrete-trial learning. A teacher runs short sessions (prompt → 2–4 large choices → response) in three skill domains, with an adaptive engine, optional eye tracking, on-device ML, an AAC board, and an optional cloud backend for multi-teacher sync and live monitoring.

Built by a special education teacher (Mod SDC, grades 3–5). Proof of concept. **Not classroom-deployed. Not a medical or educational diagnostic tool.** Do not imply otherwise in UI copy, docs, or comments.

## Student-data safety (non-negotiable)

Special education records are among the most sensitive data this codebase can touch. Agents must treat that as a hard constraint, not a style preference.

- **Never** put real student PII in samples, fixtures, commits, screenshots, docs, prompts, logs, or agent instruction files. That includes full names, student IDs, IEP text from a real child, photos, school IDs, addresses, medical notes, and anything that could identify a real learner.
- Prefer **fictional placeholders**. The shipped seeds (`src/db/seed.ts`) use first names only: Marcus, Aaliyah, DeShawn. Reuse those, or invent clearly fake names (`Alex Q.`, `Jordan P.`).
- If an example *must* look like a roster name: **first name + last initial only** (e.g. `Maya R.`). Never a full last name.
- Do not copy data out of a running IndexedDB, `server/data/db.json`, CSV/PDF exports, or a teacher's device into the repo.
- Realtime wire protocol is **PII-free by design**: session snapshots carry ids, counters, phase, and a gaze coordinate — not names. Keep it that way (`src/realtime/protocol.ts` and `server/src/realtime.ts`; they must stay in sync).
- No analytics, no error telemetry, no third-party session replay. `ErrorBoundary` logs to the console only.
- **Never commit secrets**: `.env`, Anthropic keys, `JWT_SECRET`, tokens. Templates only: `server/.env.example`. `server/data/` is gitignored; keep it that way.

Local mode stores students in Dexie (IndexedDB). Cloud mode stores per-teacher records on the optional server. Both are real student data in a real deployment — treat fixtures and docs as if they will be read in public.

## Cursor Project workspace

This repo is suitable as a **Cursor Project** workspace: a long-running coordinator plus cloud/subagents on the same tree. Project subagents inherit **this file**, including **How to run** and **How to test** below — use those scripts instead of inventing new ones. Nested `AGENTS.md` files (for example under `server/` or `src/engine/`) are optional deltas for a subtree; keep them short so they do not drift from this root file. Glob-scoped `.cursor/rules/*.mdc` is only for Cursor-only path rules that cannot live here; none are required today. Do not add `.cursorrules`.

## Stack

Two packages, not a monorepo workspace:

| | Frontend (repo root) | Backend (`server/`) |
| --- | --- | --- |
| Runtime | Vite 5 + React 18 + TypeScript (strict) | Node, Express, `tsx` |
| UI | Tailwind 3, path alias `@/` → `src/` | JSON-file `Store` (swap-ready for a real DB) |
| Data | Dexie IndexedDB (`adaptive-dtl`, schema v3) | Per-account records in `DATA_FILE` (default `./data/db.json`) |
| Tests | Vitest + jsdom + Testing Library; `src/**/*.{test,spec}.{ts,tsx}` | Vitest + Node + supertest; `server/test/**/*.test.ts` |
| AI | Direct browser Anthropic call **or** server proxy | `ANTHROPIC_API_KEY` stays on the server |
| Extra | Zustand (gaze), Zod, Recharts (lazy), Workbox PWA, Web Speech, WebGazer (CDN, opt-in) | bcrypt + JWT auth, `ws` relay at `/ws/session` |

There is **no React Router**. `App.tsx` holds an in-memory `view` union: `dashboard` | `session` | `settings` | `monitor`. Nested UI (`StudentDetail`, `SessionReplay`, `Copilot`, `AddStudentModal`) lives under the dashboard, not as top-level routes.

Default models in code today: activity generation / chat `claude-sonnet-4-6`; IEP-note drafts `claude-opus-4-8` (`src/pages/Copilot.tsx`). Validate model JSON with Zod before use; on failure, fall back to hand-authored content or a visible error — never a silent retry that serves malformed trials to a student.

## `src/` vs `server/`

**Frontend is the product.** It runs fully local with `npm run dev`. Seed students and fake session history appear only when IndexedDB is empty and cloud mode is off (`seedIfEmpty` in `src/db/seed.ts`). Clearing site data resets the seed.

**`server/` is optional.** The frontend uses it only when `VITE_API_URL` is set at build/dev time (`src/api/client.ts` → `isCloudEnabled()`). Then:

- Login is required (`Login` page).
- `studentRepo`, `sessionRepo`, and `aiGeneratedRepo` delegate to `src/api/cloudRepos.ts` when a JWT is present.
- `settingsRepo` and `mlModelRepo` stay on-device (Dexie) even in cloud mode.
- AI calls go through `/api/ai/messages` and `/api/ai/stream` so the key never reaches the browser.
- Live teacher monitor uses `/ws/session`. Without the backend, monitor UI no-ops with a clear message.

Do not add a cloud-only code path that crashes local mode. Gate on `isCloudEnabled()` / `getToken()`. Do not seed the local DB in cloud mode (`App.tsx` already skips seed when cloud is on).

Server persistence is a small JSON-file `Store` (`server/src/store.ts`) with an in-memory mode for tests. New routes should stay behind that class so a later SQLite/Postgres swap does not rewrite handlers. All data routes are scoped by the JWT user id — one teacher must never read another's records (covered in `server/test/api.test.ts`).

## Engine vs domains vs pages

Think in three layers. Mixing them is the usual way this repo gets harder to test.

### Engine (`src/engine/`) — pure functions, no React, no I/O

A **trial** is one prompt → choice array → response. A **session** is about 8–12 trials in one domain (`PLANNED_TRIALS_PER_SESSION` is 10).

- `types.ts` — `StudentProfile`, `DomainId`, trial/session/adaptation types. Shared by DB and UI.
- `adaptiveEngine.ts` — `reduce(state, trialResult) → { next, decision }`. Response-based rules:
  - 3 correct in a row → bump choice count (2→3, 3→4)
  - 2 incorrect in a row → drop to 2 choices and enable errorless highlight
  - last RT > 2× rolling average (after 3 samples) → suggest a break
  - at trial 8, accuracy < 50% → end early
- `gazeRules.ts` — same `GazeSample` shape for camera or simulator. Off-screen >5s → break; look-before-answer; attention pacing.
- `sessionLogger.ts` — `SessionState` → persisted `SessionRecord`.

These thresholds are classroom design, not magic numbers to “tune” in a drive-by. If you change them, update `adaptiveEngine.test.ts` / `gazeRules.test.ts` and the README rationale in the same change.

### Domains (`src/domains/`) — content + how a choice looks

Three domains: **sight words** (Dolch, PreK–2nd, plus `aiword:` ids from the generator), **money ID** (penny → $5, inline SVGs), **community signs** (stop, exit, restroom, walk / don’t walk, danger).

`registry.tsx` is the seam: `buildTrials`, `renderChoice`, `ariaLabel`, `availableForAI`, `isValidChoiceId`. AI output is mapped through the registry so only renderable choice ids reach a session.

To add a domain: extend `DomainId` + `DOMAIN_LABELS` in `engine/types.ts`, add a folder with trials + tile, register it, update Zod/AI prompts if generation should cover it, and add tests. Do not special-case a domain inside the engine reducer.

### Pages (`src/pages/`) — React, composition, I/O

`StudentSession.tsx` is the integration point: engine `reduce` + gaze rules + advisory ML + AAC/voice/switch + realtime broadcast + Dexie/cloud save. Keep session orchestration here (or in small hooks); do not push Dexie or React into `engine/`.

Other views: `TeacherDashboard` / `StudentDetail` (trends, replay, export CSV/PDF, start session), `Settings` (eye tracking, AI generate, a11y, input), `Copilot` (streaming teacher Q&A + Zod-validated IEP draft), `TeacherMonitor` (live co-presence), `Login` (cloud only).

### Adjacent folders (do not collapse into the three layers)

| Folder | Role |
| --- | --- |
| `src/ml/` | Pure TS. Attention score from gaze; online logistic regression difficulty model. **Strictly advisory**: may ease or hold; never reverse a safety drop or early-end. Persisted per `(studentId, domain)` in Dexie. See `src/ml/README.md`. No TensorFlow.js. |
| `src/eyetracking/` | `gazeStore` picks WebGazer or `syntheticGaze` (~10Hz). Simulator is a first-class fallback (tests, no-camera demos), not scaffolding. File-by-file: [EYE_TRACKING.md](./EYE_TRACKING.md). |
| `src/ai/` | Activity generation, streaming co-pilot, Zod schemas, SSE parser. Lazy-load the Anthropic client. |
| `src/components/` | Shared UI: `ChoiceGrid`, `AACBoard`, `BreathingDot`, `LongPressExit` (3s hold-to-exit), `Reinforcer`, `GazeIndicator`, etc. |
| `src/hooks/` | `useSpeak`, `useChime`, `useLongPress`, `useSwitchScanning`. |
| `src/voice/` | Web Speech recognition + spoken-answer matcher. |
| `src/a11y/` | `usePrefersReducedMotion` — gate animation; honor it in new UI. |
| `src/lib/` | Tokens, CSV/PDF export, classnames. |
| `src/api/` | Cloud fetch, auth token, repo adapters, AI proxy clients. |

## How to run

Coordinator and Project subagents should use these commands (do not invent alternate scripts).

```bash
# Frontend only (default, local-first)
npm install
npm run dev          # http://localhost:5173
```

Optional Anthropic key: paste in Settings. Stored in IndexedDB. Direct browser calls use `anthropic-dangerous-direct-browser-access` — intentional for the single-user demo, **not** what you ship multi-tenant. In cloud mode the key is `ANTHROPIC_API_KEY` on the server instead.

```bash
# Optional backend + frontend in cloud mode
cd server
npm install
cp .env.example .env   # set JWT_SECRET (required to boot)
npm run dev            # http://localhost:8787  (REST + /ws/session)

# repo root, second terminal
VITE_API_URL=http://localhost:8787 npm run dev
```

`JWT_SECRET` is required; the server exits without it. `ANTHROPIC_API_KEY` is optional — without it `/api/ai/messages` returns 503 and the client falls back to authored trials.

## How to test

Same for Project subagents: run the package you touched.

```bash
npm test                 # frontend
npm run test:watch
npm run typecheck
npm run build            # tsc -b && vite build (PWA + manualChunks)

cd server && npm test
cd server && npm run typecheck
```

CI (`.github/workflows/ci.yml`, Node 20) runs both packages: frontend typecheck / test / build, server typecheck / test. Server Vitest uses an inline empty PostCSS config so Vite does not load the root Tailwind config (`server/vitest.config.ts`) — do not remove that.

Prefer unit tests next to the code they cover:

- Engine/ML/gaze/protocol: pure functions, no DOM.
- Components/hooks: Testing Library.
- Server: supertest against `createApp` with an in-memory store; inject fake Anthropic proxy/streamer so tests never hit the network.

Do not call live Anthropic, WebGazer, or a camera in CI. Gaze tests should drive `syntheticGaze` / `gazeStore`, not the webcam.

## UI and pedagogical conventions

- **Errorless prompting** on a wrong tap: fade distractors, sage-outline the correct tile, replay the prompt. No buzzer, no red X.
- **Long-press exit** (3s ring), not a back button, on the student session.
- Palette (`src/lib/tokens.ts`): warm canvas `#FAF7F2`, sage `#7BA098` as the only “go” color, coral only for warnings (exit ring). No gradients, no flashing, slow motion (reinforcer ~2s, breathing dot ~4s cycle).
- Large hit targets; WCAG-oriented focus rings; `aria-live` for prompts; reduced-motion gating.
- Bundle: keep Recharts, Anthropic, Zod, replay, and session/settings off the dashboard critical path. See [BUNDLE.md](./BUNDLE.md) for chunking. (That doc’s older “no service worker” note is stale — Workbox ships via `vite-plugin-pwa` in `vite.config.ts`.)

## What not to do

- Do not merge engine rules into React components, or domain SVG/copy into `adaptiveEngine.ts`.
- Do not add TF.js or other heavy ML deps; the on-device layer is deliberately tiny. See `src/ml/README.md`.
- Do not drop Zod validation on AI JSON.
- Do not send student names or notes over the realtime WebSocket.
- Do not “fix” errorless prompting into conventional wrong-answer punishment.
- Do not expand scope into new skill domains or VR unless the task asks; the registry is the extension point when that happens.
- Do not push or merge to `main` unless explicitly asked. Work on a feature branch and open a PR.

## Existing documentation

| Doc | Use it for |
| --- | --- |
| [README.md](./README.md) | Product intent, two-minute tour, design rationale, repo layout |
| [BUNDLE.md](./BUNDLE.md) | Route/vendor code splitting and Lighthouse notes |
| [EYE_TRACKING.md](./EYE_TRACKING.md) | Gaze pipeline, WebGazer vs simulator, file list |
| [server/README.md](./server/README.md) | Auth, REST surface, security caveats |
| [src/ml/README.md](./src/ml/README.md) | Attention + difficulty model composition and safety contract |
