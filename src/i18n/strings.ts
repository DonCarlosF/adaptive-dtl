// Student-facing localization. Lightweight and dependency-free.
//
// Scope: ONLY strings the *student* sees or hears during a session —
// narration, break/done screens, the AAC board, calibration prompts, and
// the scanning/voice input controls. Teacher UI (dashboard, settings,
// modals) and authored trial content (sight words, prompts, domain labels)
// intentionally stay English — see src/i18n/README.md for the boundary.
//
// Usage:
//   setLanguage(settings.language)   // once, at session/calibration mount
//   t("breakTitle")                  // dictionary lookup w/ en fallback
//   t("doneTitle", { name })         // simple {var} interpolation
//   speak(t("takeAMoment"), { lang: ttsLang() })

export type Language = "en" | "es";

const en = {
  // Session narration
  takeAMoment: "Take a moment. We can keep going when you're ready.",
  gettingReady: "Getting things ready…",

  // Calibration narration + labels
  calibrationIntro: "Look at the dot, then tap it. We will do this five times.",
  calibrationNext: "Now look at the next dot.",
  calibrationDone: "All set. Calibration complete.",
  calibrationPointAria: "Calibration point {n}",

  // Break screen
  breakTitle: "Take a moment.",
  breakBody: "Watch the dot. Breathe in as it grows, breathe out as it shrinks.",
  imReady: "I'm ready",

  // Done screen
  doneTitle: "Nice work, {name}.",
  doneReady: "Ready when you are.",
  correctOf: "{correct} of {total} correct",
  endedEarly: "session ended early",
  backToDashboard: "Back to dashboard",

  // Switch scanning controls
  selectButton: "Select",
  selectAria: "Select the highlighted choice",
  nextButton: "Next",
  nextAria: "Move the highlight to the next choice",

  // Voice input
  listening: "Listening",

  // AAC board chrome
  aacBoardAria: "Communication board",
  aacBoardTitle: "Tap to talk",
  aacClose: "Close communication board",
  aacOpenButton: "Talk",
  aacOpenAria: "Open communication board",
  aacMyWords: "My words",

  // AAC core vocabulary
  aacYes: "Yes",
  aacNo: "No",
  aacMore: "More",
  aacStop: "Stop",
  aacHelp: "Help",
  aacBreak: "Break",
  aacAgain: "Again",
  aacDone: "Done",
};

export type StringKey = keyof typeof en;

// Typed as a full Record so a missing key is a compile error; the runtime
// fallback in t() additionally guards partially-translated dictionaries
// (e.g. a future language added incrementally).
const es: Record<StringKey, string> = {
  takeAMoment: "Tómate un momento. Podemos seguir cuando estés listo.",
  gettingReady: "Preparando todo…",

  calibrationIntro: "Mira el punto y luego tócalo. Lo haremos cinco veces.",
  calibrationNext: "Ahora mira el siguiente punto.",
  calibrationDone: "Muy bien. Calibración completa.",
  calibrationPointAria: "Punto de calibración {n}",

  breakTitle: "Tómate un momento.",
  breakBody: "Mira el punto. Inhala cuando crece, exhala cuando se encoge.",
  imReady: "Estoy listo",

  doneTitle: "¡Buen trabajo, {name}!",
  doneReady: "Cuando quieras.",
  correctOf: "{correct} de {total} correctas",
  endedEarly: "la sesión terminó antes",
  backToDashboard: "Volver al panel",

  selectButton: "Elegir",
  selectAria: "Elegir la opción resaltada",
  nextButton: "Siguiente",
  nextAria: "Pasar a la siguiente opción",

  listening: "Escuchando",

  aacBoardAria: "Tablero de comunicación",
  aacBoardTitle: "Toca para hablar",
  aacClose: "Cerrar el tablero de comunicación",
  aacOpenButton: "Hablar",
  aacOpenAria: "Abrir el tablero de comunicación",
  aacMyWords: "Mis palabras",

  aacYes: "Sí",
  aacNo: "No",
  aacMore: "Más",
  aacStop: "Alto",
  aacHelp: "Ayuda",
  aacBreak: "Descanso",
  aacAgain: "Otra vez",
  aacDone: "Terminé",
};

export const STRINGS: Record<Language, Record<StringKey, string>> = { en, es };

/** BCP-47 tags for SpeechSynthesis / SpeechRecognition per language. */
const TTS_LANG: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
};

// Module-level current language. Set once from settings at session /
// calibration mount; components re-render on their own state changes so a
// reactive store would be overkill for a value fixed for a session's life.
let current: Language = "en";

export function setLanguage(lang: Language): void {
  current = lang === "es" ? "es" : "en";
}

export function getLanguage(): Language {
  return current;
}

/**
 * Look up a student-facing string in the current language, falling back to
 * English when a translation is missing. `vars` fills `{name}`-style
 * placeholders; unknown placeholders are left intact.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const dict = STRINGS[current] as Partial<Record<StringKey, string>>;
  const template = dict[key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** BCP-47 speech-synthesis language tag (e.g. "es-ES") for `lang` (default: current). */
export function ttsLang(lang: Language = current): string {
  return TTS_LANG[lang] ?? TTS_LANG.en;
}
