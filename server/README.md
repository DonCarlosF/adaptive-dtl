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

Storage is a small JSON-file store (`Store` in `src/store.ts`) with an
in-memory mode for tests. Its method surface is what a SQLite/Postgres
repository would expose, so swapping in a real database for a larger
deployment is a drop-in change behind that class — no route changes.

## Security notes

- Passwords are bcrypt-hashed; only the hash is stored.
- All data routes are scoped by the token's user id — one teacher can
  never read or write another's records (covered by the test suite).
- `JWT_SECRET` is required to boot; the server refuses to start without it.
- This is a starting point, not a hardened production deployment: add
  rate limiting, HTTPS termination, password-reset, and a real database
  before a district rollout.
