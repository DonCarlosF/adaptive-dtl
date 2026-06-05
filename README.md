# Adaptive DTL

**An adaptive learning app for special education, built by a special education teacher.**

I teach in a Mod SDC classroom in Oakland Unified, grades 3–5. The adaptive learning tools my students get from the district aren't bad, but "adaptive" in most of them means *the difficulty goes up when you answer right and down when you answer wrong.* That's a thermostat. Real adaptation notices when a kid stopped looking at the screen four trials ago, when their response time doubled because they're holding back a meltdown, when the third "correct" answer in a row was a lucky guess on a 2-choice array. This app is what one of those tools could look like if designed from the classroom up — with the AI tools available to a single teacher with a laptop in 2026.

## Two-Minute Tour

If you have a couple of minutes, here's the path that shows the moments that matter. Each step takes 15–25 seconds.

### 1. The dashboard scan (20s)

Open the app — you'll land on the dashboard with three seed students. **Click Marcus's card.** Look at his profile line ("3rd grade · reads at K · touch · low-stim") and the trend chart per goal area. Now scroll to **Recent sessions** and notice the chips on past entries: "3 adaptations", "ended early", an occasional "AI" tag. Those chips are the difference between a tool that records what a student did and a tool that records *what the tool noticed and adjusted.*

### 2. The errorless prompting moment (25s)

From Marcus's detail page, click **Start: Sight Words**. The session goes fullscreen. After the prompt plays, **tap a wrong answer on purpose.** Watch what happens: the distractors fade to 20% opacity, the correct choice gets a soft sage outline, the prompt repeats. No buzzer, no red X. This is errorless prompting — guiding a child to the correct answer rather than rubbing their nose in the wrong one. For students who have been told their whole school career that they're "the dumb one," that distinction is the whole game.

### 3. The breathing-dot break (25s)

Hold the exit ring in the top-right for three seconds to leave the session. Open **Settings**, toggle **Enable eye tracking** on, and toggle **Show gaze indicator during sessions** on. Start a session for **DeShawn** (Money ID is fine). You'll see a small sage dot tracking the simulated gaze across the screen — note the "Simulated" badge next to it. Within about 30 seconds the synthetic gaze will drift off-screen for more than 5 seconds and the app will switch to the breathing-dot break view. The input is simulated; the rule that fired is real downstream code (`detectGazeOffScreen` in `src/engine/gazeRules.ts`).

### 4. The architecture panel (15s)

Back in Settings, scroll to the eye tracking section and expand **Architecture: Eye Tracking**. The inline diagram has dashed arrows for Camera and WebGazer and solid arrows for everything from `gazeStore` rightward. That's the honest scope choice: the architecture is built; the camera adapter is the next ~3 days of work. See [`EYE_TRACKING.md`](./EYE_TRACKING.md) for the file-by-file rollout.

### 5. AI generation or session replay (25s)

If you have an Anthropic API key handy: paste it in the **AI-generated activities** panel, pick Aaliyah, click **Generate Sight Words**. In a few seconds you'll see "8 new Sight Words" — the response was validated with Zod, mapped through the domain registry, and cached locally. Start a Sight Words session for Aaliyah and notice the **AI** chip in the session HUD.

If you'd rather not use a key: go back to any student's dashboard, find a session with a "gaze" tag, and click **Replay**. Scrub through the trials — each one shows the adaptations triggered through that point and the recorded gaze trace overlaid on the trial.

## Screenshots

Captured screenshots live in `/docs`:

- `docs/dashboard.png` — three seed students; click into one for the trend chart per goal.
- `docs/session-trial.png` — mid-trial, three choice tiles in a clean grid.
- `docs/session-errorless.png` — distractors faded, correct tile sage-outlined after a wrong tap.
- `docs/break.png` — the breathing-dot break screen.

## Setup

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173/` with the three seed students and several weeks of mock session history. All data is local — IndexedDB via Dexie. Clearing site data resets the seed.

**Optional:** paste an Anthropic API key in Settings to enable live AI activity generation. The key never leaves your browser except in the direct call to Anthropic's Messages API, which uses the `anthropic-dangerous-direct-browser-access` header (intentional for a single-user demo; not what you'd ship in a multi-tenant product).

## What the app does

- **Teacher Dashboard.** Add students, set their reading level and goals and response method, see trend lines per goal area, scrub through past sessions in the replay view.
- **Student Session.** Fullscreen, locked to a 3-second hold-to-exit. Audio prompt, 2–4 large choice tiles, soft chime + thumbs-up on correct, errorless re-prompt on wrong, breathing-dot break when the adaptive engine suggests one, calm completion screen at the end.
- **Three skill domains.** Sight Words (Dolch list, leveled PreK–2nd, with optional AI-introduced words rendered through the same tile component). Money ID (penny → $5 bill, labeled inline SVGs). Community Signs (stop, exit, restroom, walk / don't walk, danger).
- **Adaptive engine.** Four response-based rules and three gaze-based rules that compose: choice count goes up after 3-in-a-row correct, drops to 2 with errorless on after 2-in-a-row wrong, suggests a break when response time spikes, ends the session early below 50% at trial 8. Gaze rules add an off-screen-for-5-seconds break trigger, a look-before-answer score, and an attention-pacing flag.
- **AI activity generation.** A bring-your-own-key flow that asks Claude Sonnet for trial sets tailored to a student's reading level, profile note, and recent per-item performance. Responses are validated with Zod before any caching or session use; cached by `(student, domain, contentHash)`; falls back to hand-authored content on any error with a clear toast.
- **Simulated eye tracking.** A 10Hz synthetic gaze stream with realistic drift, saccades, and occasional off-screen excursions. Real downstream rules consume it, the breathing-dot break fires from it, gaze traces are recorded into session records, the indicator overlay shows it on screen during teacher demos.
- **Session replay.** Scrub a completed session, see every trial, every adaptation event, and the recorded gaze trace overlaid per trial.
- **Settings.** Eye tracking and gaze indicator toggles, 5-point calibration UI (real flow, mock training behind it), per-domain AI generation buttons, the architecture panel with the data-flow diagram, high-contrast mode, OpenDyslexic font for sight words, audio volume.
- **Privacy.** No backend, no auth, no analytics. The only outbound network call is the AI generation call to Anthropic, and only when you click Generate.

## Design rationale

This section is the most important part of this README for anyone evaluating the work — it shows the thinking behind the choices.

**Errorless prompting on incorrect responses.** When a child taps the wrong answer, the app doesn't tell them they got it wrong. The distractors fade to 20% opacity, the correct choice gets a soft sage outline, the prompt replays. Discrete-trial research and ABA practice both find that errorless learning — guiding to the correct response rather than letting failure pile up — works better for students with significant cognitive disabilities than corrective feedback. It also keeps the kid regulated. A red X feels like a slap to a 4th grader who's already convinced they're "the dumb one." A quiet repeat with the right answer glowing is a way of saying *here, let me show you again.*

**Three correct in a row to step up; two wrong in a row to step down.** Most adaptive tools change difficulty after a single response. That makes the difficulty oscillate trial-by-trial, which reads to the kid as randomness — they can't form a model of what the system is doing. Three in a row is a believable streak. Two in a row wrong is the moment fatigue or confusion is most likely, not the moment to push harder.

**Response time more than 2× the rolling average suggests a break.** A child who takes 12 seconds to respond on a trial where they normally take 3 is telling you something — usually that they're disengaged, dysregulated, or just exhausted. Pushing through doesn't produce learning, it produces behavior incidents. The rolling window is short (last 6 trials) so the engine reacts within a single session, not against some long-term baseline.

**Below 50% accuracy at trial 8 ends the session.** A bad session is information for the teacher, not a target to grind against. If a kid is below chance after 8 trials, the right call is to end with a calm completion screen and review the data. Continuing would teach the wrong thing — both the wrong content and the meta-lesson that *being on this app means being bad at things.*

**Eyes off the screen for more than 5 seconds triggers the break view.** Even with simulated input, this rule fires from real downstream code — the data the rule sees has the same shape that real WebGazer predictions would. A student whose attention has drifted is not a student who's learning, and the break view (a slow breathing dot, calm voice prompt, "I'm ready" button) is a tool, not a punishment.

**Calm palette, slow timings, no gradients, no flashing.** Many of my students are sensory-sensitive. Bright primaries, fast animations, and saturated red error states are not neutral — they actively dysregulate some kids. The reinforcer animation runs over 2 seconds, the breathing dot pulses on a 4-second cycle, and the only place coral appears at all is the long-press exit ring.

**Long-press exit instead of a back button.** A back button gets tapped accidentally three sessions in. A 3-second hold with a visible progress ring is invisible to a student trying to dismiss the screen and obvious to an adult who needs out.

**Local-only persistence.** Special education data is among the most sensitive there is, and the moment it leaves the device the legal and ethical surface area explodes. The architecture says this app is mine and my students' alone.

## Engineering notes

Three short writeups for anyone reading the code:

**Eye tracking architecture** — see [`EYE_TRACKING.md`](./EYE_TRACKING.md). What's implemented (gaze rules, recording, replay, calibration UI, indicator overlay), what's deferred (WebGazer script load, real training, real prediction stream), why deferred (browser permission UX, accuracy variability, demo reliability), the ~3-day rollout with the file-by-file change list, and a note on why the simulator is worth keeping even after the swap (tests, no-camera demos, replay regression).

**Bundle strategy** — see [`BUNDLE.md`](./BUNDLE.md). Initial dashboard transfer is **95 KiB** with a **Lighthouse Performance score of 100** on a desktop profile. Recharts, the Anthropic client, Zod, the session replay modal, and each top-level view are all in their own chunks, loaded on demand. The doc covers what loads when, before/after numbers, and the design choices behind the split.

**AI activity generation.** Bring-your-own-key: the user pastes an Anthropic API key in Settings; it's stored only in IndexedDB. The call uses `anthropic-dangerous-direct-browser-access: true` so the browser can hit the API directly without a backend — that's intentional for a single-user portfolio demo and explicitly *not* what you'd ship in a multi-tenant product. Each call sends a domain-specific prompt with the student's reading level, profile note, and recent per-item performance. The response is parsed (tolerating prose around the JSON), validated against a Zod schema, mapped through the domain registry so only renderable choice ids survive, then cached in Dexie keyed by `(studentId, domain, contentHash)`. Identical prompts hit the cache instead of re-firing the API. Errors (rate limit, auth, network, timeout, validation) degrade with a typed reason and a clear toast — no silent retries.

## Repo layout

```
src/
  components/        Button, Card, ChoiceGrid, Reinforcer, BreathingDot, LongPressExit,
                     ProgressRing, Modal, Toast, GazeIndicator, LoadingScreen
  domains/
    sightWords/      Dolch list, ChoiceTile (renders authored + AI-introduced words)
    moneyId/         CoinSVG, BillSVG, MoneyTile
    communitySigns/  SignSVG (stop, exit, restroom, walk, don't walk, danger)
    registry.tsx     domain → trials + tile renderer + AI item lookups
  engine/
    types.ts            shared types
    adaptiveEngine.ts   pure reducer for response-based rules
    gazeRules.ts        gaze-rule implementations (off-screen, look-before, pacing)
    sessionLogger.ts    state → SessionRecord
  eyetracking/
    webgazerWrapper.ts  stub for real WebGazer integration
    syntheticGaze.ts    10Hz simulator (drift / saccade / off-screen)
    gazeStore.ts        zustand store, drives the simulator
    calibration.tsx     5-point UI with demo notice
  ai/
    activityGenerator.ts  generateTrials, loadTrialsForSession, requestAIGeneration
    anthropicClient.ts    direct-from-browser Messages API call (lazy-loaded)
    anthropicErrors.ts    typed error union + friendly messages
    promptTemplates.ts    SYSTEM_PROMPT + per-domain user prompt builder
    zodSchemas.ts         response validation
    contentHash.ts        cache-key hashing
  db/
    schema.ts             Dexie v2 (students, sessions, settings, aiGenerated)
    studentRepo.ts        ─┐
    sessionRepo.ts         ├ thin per-table repos
    settingsRepo.ts        │
    aiGeneratedRepo.ts    ─┘
    seed.ts               3 seed students + fake session history
  hooks/             useSpeak, useChime, useLongPress
  pages/             TeacherDashboard, StudentDetail, AddStudentModal, StudentSession,
                     SessionReplay, Settings, EyeTrackingArchitecture, DomainTrendChart
  lib/               tokens.ts, cn.ts
  App.tsx, main.tsx, index.css
```

## Roadmap

- **Real webcam eye tracking** via WebGazer.js. The swap is small and labeled — `EYE_TRACKING.md` lists the three files that change.
- **VR/AR plugin support.** Extend the domain interface so a Meta-Quest-rendered "walk to the corner store and buy a quarter's worth of milk" scenario can plug into the same engine. Floreo has shown what immersive functional skill instruction can look like in this population; this would be a complementary classroom tool.
- **Switch input.** The response method is already a profile field; the rollout routes it to real switch event handling.
- **AAC core-board overlay.** For students whose primary expressive system is symbol-based, surface a core board alongside the choice array.
- **IEP progress export.** One-click CSV of last quarter's accuracy and adaptation events ships today (Export CSV on the student page); a formatted PDF variant is still planned.
- **District pilot.** Real classroom deployment in a single Mod SDC classroom for one quarter, with paraprofessional training and weekly data reviews.

---

Proof of concept built by a special education teacher exploring adaptive learning design. Not classroom-deployed. Not a medical or educational diagnostic tool.
