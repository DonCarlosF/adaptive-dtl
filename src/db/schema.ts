import Dexie, { Table } from "dexie";
import { AIGeneratedSet, SessionRecord, StudentProfile } from "@/engine/types";

export interface AppSettings {
  id: "app";
  eyeTrackingEnabled: boolean;
  /**
   * Use the real webcam (WebGazer) for gaze tracking. When false, the app
   * uses the simulated gaze stream. Falls back to simulated automatically
   * if the camera or library is unavailable.
   */
  cameraTracking: boolean;
  /** Show the gaze indicator dot during sessions (teacher demo). */
  gazeIndicatorEnabled: boolean;
  highContrast: boolean;
  dyslexicFont: boolean;
  audioVolume: number; // 0..1
  apiKey: string;
  /** Route student responses through single-switch scanning input. */
  switchScanning: boolean;
  /** Dwell time per item (ms) when switch scanning is on. */
  switchScanIntervalMs: number;
}

class AdaptiveDB extends Dexie {
  students!: Table<StudentProfile, string>;
  sessions!: Table<SessionRecord, string>;
  settings!: Table<AppSettings, "app">;
  aiGenerated!: Table<AIGeneratedSet, string>;

  constructor() {
    super("adaptive-dtl");
    this.version(1).stores({
      students: "id, name, createdAt",
      sessions: "id, studentId, domain, startedAt",
      settings: "id",
    });
    // v2: add the AI-generated trial cache.
    this.version(2).stores({
      students: "id, name, createdAt",
      sessions: "id, studentId, domain, startedAt",
      settings: "id",
      aiGenerated: "id, [studentId+domain], generatedAt",
    });
  }
}

export const db = new AdaptiveDB();

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  eyeTrackingEnabled: false,
  cameraTracking: false,
  gazeIndicatorEnabled: true,
  highContrast: false,
  dyslexicFont: false,
  audioVolume: 0.7,
  apiKey: "",
  switchScanning: false,
  switchScanIntervalMs: 1500,
};
