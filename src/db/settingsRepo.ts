import { AppSettings, DEFAULT_SETTINGS, db } from "./schema";

export const settingsRepo = {
  async get(): Promise<AppSettings> {
    const row = await db.settings.get("app");
    return row ?? DEFAULT_SETTINGS;
  },

  async patch(patch: Partial<Omit<AppSettings, "id">>): Promise<AppSettings> {
    const current = await settingsRepo.get();
    const next: AppSettings = { ...current, ...patch, id: "app" };
    await db.settings.put(next);
    return next;
  },
};
