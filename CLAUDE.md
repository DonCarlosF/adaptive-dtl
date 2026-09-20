# Adaptive DTL

Adaptive discrete-trial learning (DTL) app for special education. Built by a special education teacher. Vite + React + TypeScript frontend; optional Node backend in `server/`. Proof of concept — not classroom-deployed, not a diagnostic tool.

Read **[AGENTS.md](./AGENTS.md)** before changing code. Deeper writeups: [README.md](./README.md), [BUNDLE.md](./BUNDLE.md), [EYE_TRACKING.md](./EYE_TRACKING.md), [server/README.md](./server/README.md), [src/ml/README.md](./src/ml/README.md).

## Commands

```bash
npm install
npm run dev          # http://localhost:5173 — local IndexedDB + seed students
npm test             # frontend Vitest (jsdom)
npm run typecheck
npm run build

cd server && npm install && cp .env.example .env   # set JWT_SECRET; never commit .env
npm run dev          # :8787
npm test             # backend Vitest (Node + supertest)
```

Cloud mode (optional): `VITE_API_URL=http://localhost:8787 npm run dev` from the repo root. Unset = local-only.

CI (`.github/workflows/ci.yml`, Node 20): frontend typecheck + test + build; server typecheck + test.

## Layout

| Path | Role |
| --- | --- |
| `src/engine/` | Pure session rules (no React). Response-based `adaptiveEngine.ts` + gaze `gazeRules.ts`. |
| `src/domains/` | Content: `sightWords`, `moneyId`, `communitySigns`. Wire new domains through `registry.tsx` and `DomainId` in `engine/types.ts`. |
| `src/pages/` | Views. `App.tsx` is in-memory routing (no React Router): dashboard, session, settings, monitor. |
| `src/ml/` | On-device attention scorer + logistic-regression difficulty model. Advisory only; cannot override safety drops or early-end. |
| `src/eyetracking/` | WebGazer (opt-in) or synthetic gaze → `gazeStore` → engine. |
| `src/db/` | Dexie repos. Students / sessions / AI sets delegate to `src/api/` when `VITE_API_URL` is set and the teacher is logged in. Settings and ML models stay local. |
| `src/realtime/` | PII-free co-presence protocol (keep in sync with `server/src/realtime.ts`). |
| `server/` | Optional Express + JWT + Anthropic proxy/stream + WebSocket relay (`/ws/session`). JSON-file store. |

Path alias: `@/` → `src/`.

## Hard rules

- **No real student PII** in samples, commits, docs, prompts, or agent files. Prefer fictional placeholders. If a name is required: first name + last initial only. Existing seeds (Marcus, Aaliyah, DeShawn) are fictional first names — keep them that way.
- Do not commit `.env`, API keys, `server/data/`, or IndexedDB dumps.
- Keep `src/engine/` pure and test-covered. Pedagogical thresholds are intentional (3-up / 2-down, RT break, early-end at trial 8). Do not retune casually.
- Calm UI: warm canvas, sage “go”, coral only for warnings — no saturated red errors, no gradients, no flashing. Honor `prefers-reduced-motion`.
- ML is additive and safe-only. Realtime snapshots must stay PII-free (ids, counters, gaze coords — not names).
- Dual-mode: never break local IndexedDB when adding cloud paths; gate with `isCloudEnabled()`.
