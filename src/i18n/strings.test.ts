import { describe, it, expect, afterEach } from "vitest";
import {
  STRINGS,
  StringKey,
  getLanguage,
  setLanguage,
  t,
  ttsLang,
} from "./strings";

afterEach(() => {
  // Module-level language is shared state — always restore the default.
  setLanguage("en");
});

describe("i18n strings", () => {
  it("es covers every en key (dictionary parity)", () => {
    const enKeys = Object.keys(STRINGS.en).sort();
    const esKeys = Object.keys(STRINGS.es).sort();
    const missing = enKeys.filter((k) => !esKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("en covers every es key (no orphan translations)", () => {
    const enKeys = Object.keys(STRINGS.en);
    const orphans = Object.keys(STRINGS.es).filter((k) => !enKeys.includes(k));
    expect(orphans).toEqual([]);
  });

  it("no dictionary entry is empty", () => {
    for (const lang of ["en", "es"] as const) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
      }
    }
  });

  it("t() reads the language set via setLanguage", () => {
    expect(t("aacYes")).toBe("Yes");
    setLanguage("es");
    expect(getLanguage()).toBe("es");
    expect(t("aacYes")).toBe("Sí");
    expect(t("imReady")).toBe("Estoy listo");
  });

  it("t() falls back to English for a missing translation", () => {
    setLanguage("es");
    const dict = STRINGS.es as Partial<Record<StringKey, string>>;
    const saved = dict.breakBody;
    delete dict.breakBody; // simulate a partially-translated dictionary
    try {
      expect(t("breakBody")).toBe(STRINGS.en.breakBody);
    } finally {
      dict.breakBody = saved;
    }
  });

  it("t() interpolates {var} placeholders and leaves unknown ones intact", () => {
    expect(t("doneTitle", { name: "Ada" })).toBe("Nice work, Ada.");
    expect(t("correctOf", { correct: 3, total: 8 })).toBe("3 of 8 correct");
    setLanguage("es");
    expect(t("doneTitle", { name: "Ada" })).toBe("¡Buen trabajo, Ada!");
    // Unknown placeholder is left visible rather than dropped.
    expect(t("doneTitle", { other: "x" })).toContain("{name}");
  });

  it("ttsLang() maps languages to BCP-47 speech tags", () => {
    expect(ttsLang()).toBe("en-US");
    expect(ttsLang("es")).toBe("es-ES");
    setLanguage("es");
    expect(ttsLang()).toBe("es-ES");
  });

  it("setLanguage guards unexpected values back to English", () => {
    setLanguage("fr" as never);
    expect(getLanguage()).toBe("en");
  });
});
