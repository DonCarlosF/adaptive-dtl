# Student-facing localization (`src/i18n`)

Lightweight, dependency-free string dictionaries for the parts of the app a
**student** sees or hears during a session. Currently `en` (default) and `es`.

## How it works

- `strings.ts` exports typed dictionaries (`STRINGS.en` / `STRINGS.es`), a
  module-level `setLanguage(lang)` / `getLanguage()`, a lookup `t(key, vars?)`
  with `{name}`-style interpolation, and `ttsLang()` which maps the current
  language to a BCP-47 speech tag (`en-US` / `es-ES`).
- The language is a single app setting (`AppSettings.language`, teacher-set in
  Settings → Display & audio → "Student-facing language") and is fixed for the
  life of a session. `StudentSession` and the calibration overlay call
  `setLanguage(settings.language)` when they mount; there is no reactive store
  because the value never changes mid-session.
- Spoken output routes the same language to the Web Speech API:
  `speak(t("takeAMoment"), { lang: ttsLang() })`. `useSpeak` picks a voice
  matching the utterance language when the platform has one, otherwise it
  leaves voice selection to the browser via `utterance.lang`.
- Missing translations fall back to English at runtime, and a test enforces
  key parity between dictionaries so gaps are caught in CI.

## What is (and is not) localized

**Localized (student-facing):**

- Session narration ("Take a moment…"), loading text, break screen, done
  screen, and their buttons ("I'm ready", "Back to dashboard").
- Calibration narration ("Look at the dot…") and the calibration dot's
  accessible label.
- The AAC board: core words (yes/no/more/stop/help/break/again/done), the
  board title/aria labels, and the "My words" group label. A student's
  personal `aacWords` are teacher-authored text and are rendered verbatim,
  but they are *spoken* with the student-facing language's voice.
- Switch-scanning controls ("Select" / "Next" and their aria labels) and the
  voice-input "Listening" indicator.

**Intentionally NOT localized (the boundary):**

- **Authored trial content** — sight words, money/community-sign prompts,
  AI-generated trial sets, choice labels, and `DOMAIN_LABELS`. These are
  curriculum *content*, not UI chrome: translating them changes what is being
  taught (a Spanish sight-word program is different content, not a different
  label). Content localization is a separate effort with its own authored
  sets per language.
- **Teacher-facing UI** — dashboard, settings, modals, HUD, calibration
  status hints. Teachers operate the English admin surface today; widening
  scope there is future work.

## Adding a language

1. Add the code to the `Language` union and a full dictionary to `STRINGS`
   (the `Record<StringKey, string>` type makes missing keys a compile error).
2. Add its BCP-47 tag to `TTS_LANG`.
3. Add an `<option>` to the "Student-facing language" select in
   `src/pages/Settings.tsx`.
4. The parity test in `strings.test.ts` covers the rest.
