# Deploying Adaptive DTL

Two deployment shapes, matching the app's two modes.

## 1. Static hosting (local-first mode — simplest)

No backend, no accounts: every teacher device keeps its own data in
IndexedDB, exactly like `npm run dev`.

```bash
npm ci && npm run build   # do NOT set VITE_API_URL
```

Upload `dist/` to any static host (Netlify, GitHub Pages, S3+CloudFront,
a school web server). Requirements:

- **HTTPS** — required for camera (eye tracking), microphone (voice
  input), and service-worker installation.
- **SPA fallback** — serve `index.html` for unknown paths.
- **Don't cache `sw.js` / `manifest.webmanifest`** (or updates won't roll
  out); hashed files under `assets/` are safe to cache forever.

## 2. Docker Compose (cloud mode — accounts, sync, co-presence, AI proxy)

```bash
JWT_SECRET=$(openssl rand -hex 32) \
ANTHROPIC_API_KEY=sk-ant-... \
docker compose up --build
```

Open http://localhost:8080. What you get:

| Service | Image                    | Role                                                          |
| ------- | ------------------------ | ------------------------------------------------------------- |
| `web`   | nginx + built SPA        | Static app, SPA fallback, proxies `/api` (REST) and `/ws` (co-presence WebSocket) |
| `api`   | node:20-slim + server/   | Auth, per-teacher data, Anthropic proxy + SSE stream, WS relay |

Data persists in the `dtl-data` named volume (SQLite by default via
`DATA_BACKEND=sqlite`; set `DATA_BACKEND=json` for the file store).

### Going to a real domain

1. Set `PUBLIC_ORIGIN=https://dtl.yourdistrict.org` when building —
   it's baked into the SPA (`VITE_API_URL`), so browsers call the same
   origin and nginx proxies onward.
2. Terminate TLS in front of `web` (Caddy, Traefik, a school load
   balancer). The API sends HSTS only when it sees
   `X-Forwarded-Proto: https` (nginx already forwards it).
3. Set a strong `JWT_SECRET` and keep it stable across restarts (tokens
   are signed with it).
4. `ANTHROPIC_API_KEY` is optional — without it, AI generation returns a
   friendly 503 and the app falls back to hand-authored activities.

### Environment reference (api)

| Var                 | Default                     | Meaning                              |
| ------------------- | --------------------------- | ------------------------------------ |
| `JWT_SECRET`        | — (required)                | Token signing secret                 |
| `ANTHROPIC_API_KEY` | unset                       | Enables the AI proxy + streaming     |
| `DATA_BACKEND`      | `sqlite` (in compose)       | `sqlite` or `json`                   |
| `DB_FILE`           | `/app/server/data/app.db`   | SQLite path                          |
| `DATA_FILE`         | `/app/server/data/db.json`  | JSON-store path                      |
| `PORT`              | `8787`                      | API port (internal)                  |

### Backups

- **Cloud mode:** snapshot the `dtl-data` volume (SQLite file or JSON).
- **Local-first mode:** teachers use Settings → Data → Export backup
  (JSON of the device's IndexedDB) and keep it somewhere safe.

### Prebuilt image variants (CI / restricted networks)

`web.Dockerfile` and `api.Dockerfile` run `npm ci` inside the build —
the standard pattern, but it needs clean registry access. Behind
strict/MITM proxies (or to reuse a CI build), use the prebuilt variants,
which package artifacts built outside Docker and touch no network:

```bash
# web: build the SPA first, then package it
VITE_API_URL=https://dtl.yourdistrict.org npm ci && npm run build
docker build -f deploy/web-prebuilt.Dockerfile -t adaptive-dtl-web .

# api: install server deps on a linux-x64 builder, then package the tree
(cd server && npm ci)
docker build -f deploy/api-prebuilt.Dockerfile -t adaptive-dtl-api .
```

Both produce runtime-identical images to the canonical Dockerfiles.

### Operational notes

- Rate limiting and security headers are built into the API; nginx adds
  matching headers for static responses.
- The WebSocket relay rides the same origin (`/ws/session`), so no extra
  ports or CORS configuration are needed.
- Camera/microphone features require HTTPS in production browsers even
  though everything runs on-device — plan TLS from day one.
