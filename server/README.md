# Adaptive DTL — Cloud Backend

An **optional** backend that turns Adaptive DTL from a single-device,
bring-your-own-key app into a deployable multi-teacher product:

- **Accounts & auth** — email/password, bcrypt-hashed, JWT sessions.
- **Per-teacher data sync** — students, sessions, and AI-generated sets
  are scoped to the logged-in account and persisted server-side.
- **Anthropic proxy** — AI generation calls go through the server, so the
  Anthropic API key lives in the server environment and **never reaches
  the browser** (the multi-tenant-safe alternative to the app's default
  direct-from-browser path).

The frontend runs fully local by default. It only uses this backend when
`VITE_API_URL` is set at build/dev time (see the root README).

## Run

```bash
cd server
npm install
cp .env.example .env      # set JWT_SECRET (and optionally ANTHROPIC_API_KEY)
npm run dev               # http://localhost:8787
```

Point the frontend at it:

```bash
# from the repo root
VITE_API_URL=http://localhost:8787 npm run dev
```

## Scripts

| Script           | What it does                          |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Watch-mode server via `tsx`           |
| `npm start`      | Run once                              |
| `npm run typecheck` | `tsc --noEmit`                     |
| `npm test`       | Vitest + supertest API suite          |

## API

All routes are under `/api`. Authenticated routes need
`Authorization: Bearer <token>`.

| Method | Path                                   | Purpose                          |
| ------ | -------------------------------------- | -------------------------------- |
| POST   | `/api/auth/register`                   | Create account → `{ token, user }` |
| POST   | `/api/auth/login`                      | Sign in → `{ token, user }`      |
| POST   | `/api/auth/request-reset`              | Start a password reset (always 200) |
| POST   | `/api/auth/reset`                      | Finish a reset with a token      |
| GET    | `/api/auth/me`                         | Current user                     |
| GET    | `/api/students`                        | List the teacher's students      |
| PUT    | `/api/students/:id`                    | Upsert a student                 |
| DELETE | `/api/students/:id`                    | Delete a student (cascades)      |
| GET    | `/api/students/:id/sessions`           | Sessions for a student           |
| POST   | `/api/sessions`                        | Save a session record            |
| GET    | `/api/students/:id/ai/:domain/latest`  | Latest AI set for a domain       |
| GET/PUT| `/api/ai-sets/:id`                     | Fetch / store an AI set by id    |
| POST   | `/api/ai/messages`                     | Anthropic proxy (key server-side)|

## Persistence

Two interchangeable backends implement the same `DataStore` interface
(`src/store.ts`); routes never know which one is underneath, and a shared
behavioral suite (`test/stores.test.ts`) runs against both.

| `DATA_BACKEND` | Backend                              | Location env (default)     |
| -------------- | ------------------------------------ | -------------------------- |
| `json` (default) | JSON-file `Store` (`src/store.ts`) | `DATA_FILE` (`./data/db.json`) |
| `sqlite`       | `SqliteStore` (`src/sqliteStore.ts`), better-sqlite3, WAL mode, prepared statements | `DB_FILE` (`./data/app.db`) |

The default is unchanged from earlier versions — nothing switches to SQLite
unless you opt in with `DATA_BACKEND=sqlite`. The SQLite schema keeps the
client payloads opaque in a JSON `data` column and extracts the columns the
queries need (`user_id`, `student_id`, `domain`, `generated_at`) into
indexed columns at write time. Both stores have an in-memory mode used by
the tests (`new Store()` / `new SqliteStore()` with no path). There is no
automatic migration between backends.

## Rate limiting

Per-IP, in-memory, sliding-window rate limiting (`src/rateLimit.ts`, no
dependencies) is on by default:

- **`/api/auth/*` — 10 accepted requests/min per IP** (login, register, and
  the reset endpoints are the brute-force target).
- **`/api/*` — 120 accepted requests/min per IP** (all API traffic,
  including the auth routes — an auth request draws from both budgets).

Over-limit requests get `429` with a `retry-after` header (seconds);
rejected requests don't consume budget, so backing off for `retry-after`
always works. Tune or disable via the `rateLimit` option of `createApp`
(`{ enabled, authLimit, apiLimit, windowMs }` — tests disable it or inject
a clock via the `now` option).

Behind a reverse proxy / load balancer, set `TRUST_PROXY` (e.g. `1`) so
`req.ip` is the real client, not the proxy — otherwise all clients share
one bucket. Never set it when clients connect directly, or they could
spoof `X-Forwarded-For` to dodge the limiter.

## Password reset

1. `POST /api/auth/request-reset { email }` — **always responds
   `200 { ok: true }`**, whether or not the account exists (no user
   enumeration). When it exists, a single-use token (32 random bytes,
   30-minute expiry, only its SHA-256 hash is stored) is created and
   logged to the server console — a stand-in for email delivery; wire up
   a mailer before a real rollout.
2. `POST /api/auth/reset { token, newPassword }` — validates (8+ chars),
   consumes the token (one redemption ever, expiry enforced), and
   bcrypt-rehashes the password. Invalid/expired/reused tokens get `400`.

Dev/test only: `createApp({ exposeResetTokens: true })` echoes the token in
the request-reset response body so the flow is testable without scraping
logs. Never enable it in production — `src/index.ts` does not.

## Security notes

- Passwords are bcrypt-hashed; only the hash is stored. Password reset is
  single-use-token based (see above) and never reveals whether an account
  exists.
- All data routes are scoped by the token's user id — one teacher can
  never read or write another's records (covered by the test suite).
- `JWT_SECRET` is required to boot; the server refuses to start without it.
- Per-IP rate limiting is enabled by default, strictest on `/api/auth/*`
  (see above).
- Every response carries `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`;
  `Strict-Transport-Security` is added once a request arrives over HTTPS
  (`req.secure` or `X-Forwarded-Proto: https`).
- The server itself speaks plain HTTP — terminate TLS in front of it
  (reverse proxy / load balancer) and set `TRUST_PROXY` so rate limiting
  and HSTS see real client info.
- Remaining before a district rollout: real email delivery for resets,
  token/session revocation, audit logging, and backups for whichever
  data backend you run.
