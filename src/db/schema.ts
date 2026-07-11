import Dexie, { Table } from "dexie";
import { AIGeneratedSet, SessionRecord, StudentProfile } from "@/engine/types";
import type { MLModelRecord } from "./mlModelRepo";

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
  /** Accept spoken answers via the Web Speech API during trials. */
  voiceInput: boolean;
  /** Show the AAC core-vocabulary board during sessions. */
  aacBoard: boolean;
  // --- access-inclusion ---
  /**
   * Switch-scanning mode. "auto" (default): the highlight advances on the
   * dwell timer and one switch selects. "step": manual two-switch — switch 1
   * (Space / on-screen Next) advances, switch 2 (Enter / Select) chooses.
   */
  switchScanMode: "auto" | "step";
  /** Epoch ms of the last completed eye-tracking calibration; null = never. */
  lastCalibrationAt: number | null;
  /**
   * Student-facing language (session narration, break/done screens, AAC
   * board, scanning controls). Teacher UI and authored trial content stay
   * English — see src/i18n/README.md.
   */
  language: "en" | "es";
  // --- end access-inclusion ---
}

class AdaptiveDB extends Dexie {
  students!: Table<StudentProfile, string>;
  sessions!: Table<SessionRecord, string>;
  settings!: Table<AppSettings, "app">;
  aiGenerated!: Table<AIGeneratedSet, string>;
  mlModels!: Table<MLModelRecord, string>;

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
    // v3: add per-(student, domain) on-device ML models. Primary key `id`
    // is the composite `${studentId}::${domain}`; the compound index mirrors
    // the aiGenerated table. No data migration — the table starts empty and
    // fills lazily as students complete sessions.
    this.version(3).stores({
      students: "id, name, createdAt",
      sessions: "id, studentId, domain, startedAt",
      settings: "id",
      aiGenerated: "id, [studentId+domain], generatedAt",
      mlModels: "id, [studentId+domain], updatedAt",
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
  voiceInput: false,
  aacBoard: false,
  // --- access-inclusion (settingsRepo.get merges defaults, so no migration) ---
  switchScanMode: "auto",
  lastCalibrationAt: null,
  language: "en",
  // --- end access-inclusion ---
};
