# Bundle Strategy

A short note on how this app's production bundle is shaped, and why.

## The shape

Two layers of splitting:

1. **Route chunks.** The three top-level views (Teacher Dashboard, Student Session, Settings) are loaded with `React.lazy()` in `App.tsx`. A user opening the app downloads the dashboard chunk; the session and settings chunks come down on navigation.
2. **In-route chunks.** Inside the dashboard, the trend chart (Recharts) and the session replay modal are also lazy. Inside Settings, the Anthropic fetch wrapper is dynamic-imported when a Generate button is clicked. The point: a feature's dependencies don't enter the user's tab until they reach the feature.

On top of that, `vite.config.ts` uses a function-form `manualChunks` to group third-party code into vendor chunks (`react-vendor`, `charts`, `db`, `validation`, `state`) so the cache survives app-code changes between deploys.

## What loads when

| User action                          | Chunks fetched                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Open app (dashboard)                 | `index`, `react-vendor`, `db` (Dexie for IndexedDB seed), `TeacherDashboard`, shared icons |
| Expand a student card                | `DomainTrendChart`, `charts` (Recharts + d3)                                         |
| Click "Replay" on a session          | `SessionReplay`                                                                      |
| Navigate to Settings                 | `Settings`, `activityGenerator`, `validation` (Zod)                                  |
| Click "Generate" in Settings         | `anthropicClient` (the fetch wrapper)                                                |
| Start a student session              | `StudentSession`, `state` (zustand for the gaze store)                               |

Everything is on-demand. A user who lands on the dashboard, glances at it, and closes the tab never downloads Recharts, Zod, the Anthropic client, or the session pages.

## Measurements

Built with `npm run build`, served with `vite preview`, audited with Lighthouse 13.3.0 in headless Chrome (`--preset=desktop`).

### Initial dashboard load (Lighthouse desktop)

| Metric                       | Before splitting        | After splitting        |
| ---------------------------- | ----------------------- | ---------------------- |
| Total transfer size          | ~225 KiB (single bundle) | **95 KiB**             |
| Performance score            | n/a (not measured)      | **100**                |
| Best Practices score         | n/a (not measured)      | **100**                |
| First Contentful Paint       | n/a                     | 0.4 s                  |
| Largest Contentful Paint     | n/a                     | 0.5 s                  |
| Total Blocking Time          | n/a                     | 0 ms                   |
| Cumulative Layout Shift      | n/a                     | 0                      |
| Speed Index                  | n/a                     | 0.6 s                  |
| Time to Interactive          | n/a                     | 0.5 s                  |

The "before splitting" baseline is the pass-2 build: one ~760 KB raw JS chunk, ~223 KB gzipped, plus CSS. After splitting, the dashboard route transfers 95 KiB total (HTML + CSS + JS + favicon).

### Per-chunk sizes after splitting

Raw and gzip sizes from `vite build`:

| Chunk                       | Raw     | Gzipped | When it loads                            |
| --------------------------- | ------- | ------- | ---------------------------------------- |
| `index` (app shell)         | 7.4 KB  | 3.4 KB  | Initial                                  |
| `react-vendor`              | 142 KB  | 45.5 KB | Initial                                  |
| `db` (Dexie)                | 96 KB   | 32.4 KB | Initial (seed runs on mount)             |
| CSS                         | 21 KB   | 4.5 KB  | Initial                                  |
| `TeacherDashboard`          | 13 KB   | 4.5 KB  | Initial (lazy route, loads with first paint) |
| shared icon chunks          | ~5 KB   | ~2 KB   | Initial (lucide-react icons)             |
| `DomainTrendChart`          | 0.7 KB  | 0.5 KB  | Student detail expanded                  |
| `charts` (Recharts + d3)    | 383 KB  | 105 KB  | Student detail expanded                  |
| `SessionReplay`             | 5.7 KB  | 2.3 KB  | "Replay" clicked                         |
| `StudentSession`            | 18 KB   | 6.7 KB  | Session started                          |
| `state` (zustand)           | 0.7 KB  | 0.4 KB  | With session start                       |
| `Settings`                  | 14 KB   | 5.3 KB  | Settings opened                          |
| `activityGenerator`         | 22 KB   | 7.8 KB  | Settings opened                          |
| `validation` (Zod)          | 53 KB   | 12.1 KB | Settings opened                          |
| `anthropicClient`           | 1.4 KB  | 0.8 KB  | First Generate click                     |

### How to reproduce

```bash
npm run build
npm run preview -- --port 4173
# In another terminal:
npx lighthouse http://localhost:4173/ \
  --preset=desktop \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,best-practices \
  --output=html --output-path=./lighthouse.html
```

## Design choices

**Why is Recharts so big?** Recharts ships with d3-shape, d3-scale, d3-array, and several other d3 submodules. We could hand-pick narrower imports, but the cost-to-cleanliness ratio favors lazy-loading the whole thing — the chart is only seen in the student detail view, so most users in a quick demo never trigger that 105 KiB transfer.

**Why is `db` (Dexie) on the initial path?** The seed function runs on app mount to ensure the three example students exist. Dexie is a hard dependency of that. If the seed step moved to a worker or a deferred mount, `db` could move off the initial path, but for a single-tab teacher-facing app the tradeoff isn't worth the complexity.

**Why dynamic-import the Anthropic client?** It's tiny (1.4 KB raw), so the size win is small. The reason is conceptual cleanliness: a feature that ships only on a network call should not be in the bundle of a feature that doesn't. It also documents the contract — "this code only runs on Generate" — better than a static import would.

**Why a `LoadingScreen` instead of `null` for Suspense fallback?** Route transitions are fast (one chunk fetch) but on a cold cache or slow network the user shouldn't see a flash of nothing. The fallback is a slow, sage spinner on the warm-canvas background — it reads as "the app is here, just pausing politely" rather than "the page is broken."

## What's not in scope here

- **No service worker.** This is a portfolio demo with no offline contract. Caching is the browser's job.
- **No image optimization.** All visuals are inline SVGs already under a couple of KB each.
- **No prefetching.** Could add `<link rel="modulepreload">` for the dashboard chunk to shave 30–50ms off LCP, but the current numbers (LCP 0.5s) don't justify the added config.
- **No tree-shaking gymnastics on Recharts.** Lazy-loading the whole library is cleaner than hand-picking subcomponents and breaks on the next library upgrade.
